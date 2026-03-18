from fastapi import APIRouter, HTTPException
import pandas as pd
import torch
import os
import numpy as np

from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

from federated.model import LogisticRegressionModel
from federated.config import MODEL_FEATURES, INPUT_DIM

router = APIRouter()

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ---------------------------------------------------
# Config
# ---------------------------------------------------
TEMPERATURE_SCALING = 1.5
PROB_MIN            = 0.01
PROB_MAX            = 0.99
TOP_N_FEATURES      = 5

# Deterioration urgency levels
URGENCY_THRESHOLDS = {
    "Stable":   (0.00, 0.25),
    "Watch":    (0.25, 0.50),
    "Concern":  (0.50, 0.72),
    "Escalate": (0.72, 1.00),
}

# Clinical reference ranges for intervention flags
CLINICAL_RANGES = {
    "heart_rate":        {"low": 50,  "high": 100, "unit": "BPM"},
    "oxygen_saturation": {"low": 94,  "high": 100, "unit": "%"},
    "blood_pressure":    {"low": 60,  "high": 100, "unit": "mmHg"},
    "glucose":           {"low": 70,  "high": 180, "unit": "mg/dL"},
    "creatinine":        {"low": 0.0, "high": 1.2, "unit": "mg/dL"},
    "white_blood_cells": {"low": 4.0, "high": 11.0,"unit": "x10³/µL"},
    "bun":               {"low": 0.0, "high": 20.0,"unit": "mg/dL"},
}

# Actionable suggestions shown to clinicians
# when a vital is outside its normal range
INTERVENTION_SUGGESTIONS = {
    "heart_rate_high":        "Consider cardiac monitoring and rate control review.",
    "heart_rate_low":         "Assess for bradycardia — review medications and pacemaker status.",
    "oxygen_saturation_low":  "O₂ saturation below threshold — review oxygen therapy and ventilation.",
    "blood_pressure_low":     "Hypotension detected — consider fluid resuscitation or vasopressor review.",
    "blood_pressure_high":    "Hypertension noted — review antihypertensive protocol.",
    "glucose_high":           "Hyperglycaemia — review insulin protocol and nutrition.",
    "glucose_low":            "Hypoglycaemia risk — administer glucose and recheck.",
    "creatinine_high":        "Elevated creatinine — consider nephrology review and fluid balance.",
    "white_blood_cells_high": "Elevated WBC — assess for infection or sepsis, consider blood cultures.",
    "white_blood_cells_low":  "Low WBC — assess immunosuppression risk.",
    "bun_high":               "Elevated BUN — review renal function and hydration status.",
}


# ---------------------------------------------------
# Utility
# ---------------------------------------------------

def safe_float(v):
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        if np.isnan(v) or np.isinf(v):
            return None
    return float(v)


def classify_urgency(prob: float) -> str:
    for label, (low, high) in URGENCY_THRESHOLDS.items():
        if low <= prob < high:
            return label
    return "Escalate"


def compute_news2_score(clinical: dict) -> dict:
    """
    Simplified NEWS2 (National Early Warning Score 2).
    A validated clinical scoring system used in ICUs worldwide.
    Each vital contributes 0-3 points based on deviation
    from normal — total score determines response level.
    """
    score      = 0
    components = {}

    # O2 saturation
    sao2 = clinical.get("oxygen_saturation")
    if sao2 is not None:
        if sao2 < 92:
            pts = 3
        elif sao2 < 94:
            pts = 2
        elif sao2 < 96:
            pts = 1
        else:
            pts = 0
        score += pts
        components["O₂ Saturation"] = pts

    # Heart rate
    hr = clinical.get("heart_rate")
    if hr is not None:
        if hr <= 40 or hr >= 131:
            pts = 3
        elif hr <= 50 or hr >= 111:
            pts = 2
        elif hr >= 91:
            pts = 1
        else:
            pts = 0
        score += pts
        components["Heart Rate"] = pts

    # Blood pressure (mean arterial)
    bp = clinical.get("blood_pressure")
    if bp is not None:
        if bp <= 50:
            pts = 3
        elif bp <= 60:
            pts = 2
        elif bp <= 70:
            pts = 1
        else:
            pts = 0
        score += pts
        components["Blood Pressure"] = pts

    # Age factor
    age = clinical.get("age")
    if age is not None and age >= 65:
        score += 1
        components["Age ≥65"] = 1

    # BUN (renal stress proxy)
    bun = clinical.get("bun")
    if bun is not None:
        if bun > 40:
            pts = 2
        elif bun > 20:
            pts = 1
        else:
            pts = 0
        score += pts
        components["BUN"] = pts

    # WBC (infection proxy)
    wbc = clinical.get("white_blood_cells")
    if wbc is not None:
        if wbc > 15 or wbc < 2:
            pts = 2
        elif wbc > 11 or wbc < 4:
            pts = 1
        else:
            pts = 0
        score += pts
        components["WBC"] = pts

    if score <= 2:
        interpretation = "Low — routine monitoring"
        colour = "green"
    elif score <= 4:
        interpretation = "Low-Medium — increase monitoring frequency"
        colour = "yellow"
    elif score <= 6:
        interpretation = "Medium — urgent clinical review required"
        colour = "orange"
    else:
        interpretation = "High — consider critical care escalation"
        colour = "red"

    return {
        "total":          score,
        "interpretation": interpretation,
        "colour":         colour,
        "components":     components
    }


def compute_sirs_criteria(clinical: dict) -> dict:
    """
    SIRS (Systemic Inflammatory Response Syndrome) criteria.
    2 or more criteria met suggests systemic inflammation
    and potential early sepsis — clinically validated standard.
    """
    criteria_met = []
    criteria_all = {}

    criteria_all["Temperature"] = "Not assessed (not in dataset)"

    hr = clinical.get("heart_rate")
    if hr is not None:
        met = hr > 90
        criteria_all["Heart Rate >90 BPM"] = met
        if met:
            criteria_met.append("Heart Rate >90 BPM")

    wbc = clinical.get("white_blood_cells")
    if wbc is not None:
        met = wbc < 4 or wbc > 12
        criteria_all["WBC <4 or >12 x10³"] = met
        if met:
            criteria_met.append("WBC <4 or >12 x10³")

    bun = clinical.get("bun")
    if bun is not None:
        met = bun > 25
        criteria_all["Metabolic Stress (BUN >25)"] = met
        if met:
            criteria_met.append("Metabolic Stress (BUN >25)")

    count       = len(criteria_met)
    sepsis_flag = count >= 2

    return {
        "criteria_met": criteria_met,
        "criteria_all": criteria_all,
        "count":        count,
        "sepsis_alert": sepsis_flag,
        "message": (
            "SIRS criteria met — assess for sepsis" if sepsis_flag
            else "No SIRS criteria threshold reached"
        )
    }


# ---------------------------------------------------
# Load Global Model
# ---------------------------------------------------

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "global_model.pt")

model = LogisticRegressionModel(INPUT_DIM).to(DEVICE)

def load_global_model():
    """
    Load (or reload) the global model from disk.
    Called at startup AND after every federation run
    so the clinician portal always uses the latest
    trained weights without requiring a server restart.
    """
    if not os.path.exists(MODEL_PATH):
        import warnings
        warnings.warn(
            f"[clinician.py] Global model not found at {MODEL_PATH}. "
            "Run federation first. Predictions will use an untrained model.",
            RuntimeWarning,
            stacklevel=2
        )
    else:
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
        model.eval()
        print(f"[clinician.py] Global model loaded from {MODEL_PATH}")

# Load at startup
load_global_model()


# ---------------------------------------------------
# Load Dataset and fit preprocessors once at startup
# ---------------------------------------------------

DATA_PATH = os.path.join(BASE_DIR, "data", "processed", "merged_dataset.csv")

if not os.path.exists(DATA_PATH):
    raise RuntimeError(f"[clinician.py] Dataset not found at {DATA_PATH}.")

df = pd.read_csv(DATA_PATH)

imputer = SimpleImputer(strategy="median")
scaler  = StandardScaler()

X_imputed_all = imputer.fit_transform(df[MODEL_FEATURES])
scaler.fit(X_imputed_all)


# ---------------------------------------------------
# Endpoint
# ---------------------------------------------------

@router.get("/patient/{patient_id}")
def get_patient_assessment(patient_id: int):

    # -----------------------------------------------
    # Lookup
    # -----------------------------------------------
    rows = df[df["patientunitstayid"] == patient_id]
    if rows.empty:
        raise HTTPException(
            status_code=404,
            detail=f"Patient {patient_id} not found."
        )
    patient = rows.iloc[0]

    # -----------------------------------------------
    # Feature preparation
    # -----------------------------------------------
    feature_df   = pd.DataFrame([patient[MODEL_FEATURES]], columns=MODEL_FEATURES)
    raw_values   = feature_df.iloc[0]
    imputed_mask = raw_values.isna().values

    X_imp    = imputer.transform(feature_df)
    X_scaled = scaler.transform(X_imp)
    x        = torch.tensor(X_scaled, dtype=torch.float32).to(DEVICE)

    # -----------------------------------------------
    # Deterioration probability
    # -----------------------------------------------
    with torch.no_grad():
        logits            = model(x)
        calibrated_logits = logits / TEMPERATURE_SCALING
        prob              = torch.sigmoid(calibrated_logits).item()
        prob              = max(PROB_MIN, min(prob, PROB_MAX))

    deterioration_pct = round(prob * 100, 2)
    urgency_level     = classify_urgency(prob)
    confidence        = round(abs(prob - 0.5) * 2 * 100, 2)

    # -----------------------------------------------
    # Clinical summary
    # -----------------------------------------------
    display_map = {
        "age":           "age",
        "is_senior":     "is_senior",
        "mean_heartrate":"heart_rate",
        "mean_sao2":     "oxygen_saturation",
        "mean_bp":       "blood_pressure",
        "glucose":       "glucose",
        "creatinine":    "creatinine",
        "WBC x 1000":    "white_blood_cells",
        "BUN":           "bun",
    }

    clinical_summary = {}
    for dataset_col, display_name in display_map.items():
        if dataset_col in patient.index:
            val = patient[dataset_col]
            if pd.notna(val):
                clinical_summary[display_name] = safe_float(val)

    # -----------------------------------------------
    # Out-of-range flags and actionable interventions
    # -----------------------------------------------
    reference_flags = {}
    interventions   = []

    for vital_name, ranges in CLINICAL_RANGES.items():
        val = clinical_summary.get(vital_name)
        if val is None:
            continue
        if val < ranges["low"]:
            key = f"{vital_name}_low"
            reference_flags[key] = True
            suggestion = INTERVENTION_SUGGESTIONS.get(key)
            if suggestion:
                interventions.append({
                    "vital":      vital_name,
                    "flag":       key,
                    "value":      val,
                    "unit":       ranges["unit"],
                    "direction":  "low",
                    "suggestion": suggestion
                })
        elif val > ranges["high"]:
            key = f"{vital_name}_high"
            reference_flags[key] = True
            suggestion = INTERVENTION_SUGGESTIONS.get(key)
            if suggestion:
                interventions.append({
                    "vital":      vital_name,
                    "flag":       key,
                    "value":      val,
                    "unit":       ranges["unit"],
                    "direction":  "high",
                    "suggestion": suggestion
                })

    # -----------------------------------------------
    # NEWS2 and SIRS scoring
    # -----------------------------------------------
    news2_score = compute_news2_score(clinical_summary)
    sirs        = compute_sirs_criteria(clinical_summary)

    # -----------------------------------------------
    # Explainability
    # -----------------------------------------------
    weights       = model.linear.weight.detach().cpu().numpy()[0]
    contributions = []

    for i, feature in enumerate(MODEL_FEATURES):
        impact = X_scaled[0][i] * weights[i]
        contributions.append({
            "feature": feature,
            "value":   safe_float(raw_values[feature]),
            "impact":  safe_float(impact),
            "imputed": bool(imputed_mask[i])
        })

    contributions = sorted(
        contributions,
        key=lambda c: abs(c["impact"]),
        reverse=True
    )[:TOP_N_FEATURES]

    # -----------------------------------------------
    # Fairness context
    # Computes this patient's risk relative to their
    # demographic group average — directly demonstrates
    # the BiasGuard research contribution in clinical use
    # -----------------------------------------------
    is_senior     = int(patient["is_senior"]) if "is_senior" in patient.index else 0
    patient_group = "Senior (>=65)" if is_senior == 1 else "Non-Senior (<65)"

    group_mask    = df["is_senior"] == is_senior
    group_X       = imputer.transform(df[group_mask][MODEL_FEATURES])
    group_scaled  = scaler.transform(group_X)
    group_tensor  = torch.tensor(group_scaled, dtype=torch.float32).to(DEVICE)

    with torch.no_grad():
        group_probs = torch.sigmoid(
            model(group_tensor) / TEMPERATURE_SCALING
        ).cpu().numpy().flatten()

    group_avg_prob   = float(np.mean(group_probs))
    patient_vs_group = round((prob - group_avg_prob) * 100, 2)

    fairness_context = {
        "protected_attribute":    "is_senior",
        "patient_group":          patient_group,
        "group_avg_risk_pct":     round(group_avg_prob * 100, 2),
        "patient_risk_pct":       deterioration_pct,
        "patient_vs_group_delta": patient_vs_group,
        "bias_mitigation_active": True,
        "interpretation": (
            f"This patient's deterioration risk is "
            f"{'above' if patient_vs_group > 0 else 'below'} "
            f"the average for {patient_group} patients "
            f"by {abs(patient_vs_group):.1f} percentage points."
        )
    }

    # -----------------------------------------------
    # Response
    # -----------------------------------------------
    return {
        "patient_id": int(patient_id),

        "deterioration_warning": {
            "probability":     safe_float(prob),
            "risk_percentage": deterioration_pct,
            "urgency_level":   urgency_level,
            "confidence":      confidence,
        },

        "clinical_summary":  clinical_summary,
        "reference_flags":   reference_flags,
        "interventions":     interventions,

        "news2":             news2_score,
        "sirs":              sirs,

        "explanation":       contributions,
        "fairness_context":  fairness_context,
    }