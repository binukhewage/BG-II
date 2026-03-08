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
# Utility
# ---------------------------------------------------

def safe_float(v):
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        if np.isnan(v) or np.isinf(v):
            return None
    return float(v)


# ---------------------------------------------------
# Load Global Model
# ---------------------------------------------------

model = LogisticRegressionModel(INPUT_DIM).to(DEVICE)

MODEL_PATH = "models/global_model.pt"

if os.path.exists(MODEL_PATH):
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))

model.eval()


# ---------------------------------------------------
# Load Dataset
# ---------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "processed",
    "merged_dataset.csv"
)

df = pd.read_csv(DATA_PATH)


# ---------------------------------------------------
# Preprocessing (MATCH TRAINING PIPELINE)
# ---------------------------------------------------

imputer = SimpleImputer(strategy="median")
scaler = StandardScaler()

X_all = df[MODEL_FEATURES]

X_imputed = imputer.fit_transform(X_all)
scaler.fit(X_imputed)


# ---------------------------------------------------
# Clinician Endpoint
# ---------------------------------------------------

@router.get("/patient/{patient_id}")
def get_patient_prediction(patient_id: int):

    patient = df[df["patientunitstayid"] == patient_id]

    if patient.empty:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient = patient.iloc[0]

    # ---------------------------------------------------
    # Prepare features
    # ---------------------------------------------------

    feature_df = pd.DataFrame([patient[MODEL_FEATURES]], columns=MODEL_FEATURES)

    raw_values = feature_df.iloc[0]
    imputed_mask = raw_values.isna().values

    # ---------------------------------------------------
    # Apply preprocessing
    # ---------------------------------------------------

    X_imputed = imputer.transform(feature_df)
    X_scaled = scaler.transform(X_imputed)

    x = torch.tensor(X_scaled, dtype=torch.float32).to(DEVICE)

    # ---------------------------------------------------
    # Prediction (Calibrated)
    # ---------------------------------------------------

    with torch.no_grad():

        logits = model(x)

        # Temperature scaling for calibration
        temperature = 1.5
        calibrated_logits = logits / temperature

        prob = torch.sigmoid(calibrated_logits).item()

        # Prevent extreme predictions
        prob = max(0.01, min(prob, 0.99))

    risk_percentage = round(prob * 100, 2)

    if prob < 0.20:
        risk_level = "Low"
    elif prob < 0.45:
        risk_level = "Moderate"
    elif prob < 0.70:
        risk_level = "High"
    else:
        risk_level = "Critical"

    confidence = abs(prob - 0.5) * 2
    confidence = round(confidence * 100, 2)

    # ---------------------------------------------------
    # Explainability
    # ---------------------------------------------------

    weights = model.linear.weight.detach().cpu().numpy()[0]

    contributions = []

    for i, feature in enumerate(MODEL_FEATURES):

        scaled_val = X_scaled[0][i]
        impact = scaled_val * weights[i]

        contributions.append({
            "feature": feature,
            "value": safe_float(raw_values[feature]),
            "impact": safe_float(impact),
            "imputed": bool(imputed_mask[i])
        })

    contributions = sorted(
        contributions,
        key=lambda x: abs(x["impact"]),
        reverse=True
    )[:5]

    # ---------------------------------------------------
    # Clinical Summary
    # ---------------------------------------------------

    clinical_summary = {}

    display_map = {
        "age": "age",
        "is_senior": "is_senior",
        "mean_heartrate": "heart_rate",
        "mean_sao2": "oxygen_saturation",
        "mean_bp": "blood_pressure",
        "glucose": "glucose",
        "creatinine": "creatinine",
        "WBC x 1000": "white_blood_cells",
        "BUN": "bun"
    }

    for dataset_feature, display_name in display_map.items():

        value = patient.get(dataset_feature)

        if pd.notna(value):
            clinical_summary[display_name] = safe_float(value)

    # ---------------------------------------------------
    # Fairness Context
    # ---------------------------------------------------

    fairness_context = {
        "protected_attribute": "is_senior",
        "patient_group": "Senior (≥65)" if patient["is_senior"] == 1 else "Non-Senior (<65)"
    }

    # ---------------------------------------------------
    # Final Response
    # ---------------------------------------------------

    return {
        "patient_id": int(patient_id),

        "mortality_prediction": {
            "risk_score": safe_float(prob),
            "risk_percentage": risk_percentage,
            "risk_level": risk_level,
            "confidence": confidence
        },

        "clinical_summary": clinical_summary,

        "explanation": contributions,

        "fairness_context": fairness_context
    }