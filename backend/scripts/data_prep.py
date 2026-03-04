import pandas as pd
import numpy as np
import os


# Find the absolute path to the directory this script is in (backend/scripts)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Go up one level to get the 'backend' folder
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
# Now safely point to the 'data' folder
BASE_DIR = os.path.join(BACKEND_DIR, "data")

RAW_DIR = os.path.join(BASE_DIR, "raw")
PROCESSED_DIR = os.path.join(BASE_DIR, "processed")
HOSPITALS_DIR = os.path.join(BASE_DIR, "hospitals")
HOLDOUT_DIR = os.path.join(BASE_DIR, "holdout")

# Create all necessary directories
for directory in [PROCESSED_DIR, HOSPITALS_DIR, HOLDOUT_DIR]:
    os.makedirs(directory, exist_ok=True)

print("🚀 Starting BiasGuard Data Preparation (Local Imputation Ready)...")

# --- 1. Process Patient Data ---
print("Loading patient.csv...")
patients = pd.read_csv(os.path.join(RAW_DIR, "patient.csv"))

patient_cols = ['patientunitstayid', 'hospitalid', 'age', 'gender', 'ethnicity', 'hospitaldischargestatus']
df_patient = patients[patient_cols].copy()

# Map Target: hospitaldischargestatus (Alive = 0, Expired = 1)
df_patient = df_patient[df_patient['hospitaldischargestatus'].isin(['Alive', 'Expired'])]
df_patient['mortality'] = df_patient['hospitaldischargestatus'].apply(lambda x: 1 if x == 'Expired' else 0)

# Clean Age (NO IMPUTATION HERE)
df_patient['age'] = df_patient['age'].replace('> 89', '90')
df_patient['age'] = pd.to_numeric(df_patient['age'], errors='coerce')

# Create Protected Attribute (is_senior), leaving NaN if age is NaN
df_patient['is_senior'] = df_patient['age'].apply(lambda x: 1.0 if x > 65 else (0.0 if x <= 65 else np.nan))

# Clean Categoricals
df_patient['gender'] = df_patient['gender'].fillna('Unknown')
df_patient['ethnicity'] = df_patient['ethnicity'].fillna('Unknown')

df_patient = df_patient.drop(columns=['hospitaldischargestatus'])

# --- 2. Process Vitals Data ---
print("Loading vitalPeriodic.csv and aggregating...")
vital_path = os.path.join(RAW_DIR, "vitalPeriodic.csv")
if os.path.exists(vital_path):
    try:
        vitals = pd.read_csv(vital_path, usecols=['patientunitstayid', 'heartrate', 'sao2', 'systemicmean'])
        df_vitals = vitals.groupby('patientunitstayid').mean().reset_index()
        df_vitals.rename(columns={'heartrate': 'mean_heartrate', 'sao2': 'mean_sao2', 'systemicmean': 'mean_bp'}, inplace=True)
    except Exception as e:
        print(f"⚠️ Could not process vitalPeriodic.csv. Error: {e}")
        df_vitals = pd.DataFrame(columns=['patientunitstayid'])
else:
    print("⚠️ vitalPeriodic.csv not found, skipping vitals.")
    df_vitals = pd.DataFrame(columns=['patientunitstayid'])

# --- 3. Process Lab Data ---
print("Loading lab.csv and aggregating...")
lab_path = os.path.join(RAW_DIR, "lab.csv")
if os.path.exists(lab_path):
    try:
        labs = pd.read_csv(lab_path, usecols=['patientunitstayid', 'labname', 'labresult'])
        vital_labs = ['glucose', 'creatinine', 'WBC x 1000', 'BUN']
        labs_filtered = labs[labs['labname'].isin(vital_labs)]
        df_labs = labs_filtered.pivot_table(index='patientunitstayid', columns='labname', values='labresult', aggfunc='mean').reset_index()
    except Exception as e:
        print(f"⚠️ Could not process lab.csv. Error: {e}")
        df_labs = pd.DataFrame(columns=['patientunitstayid'])
else:
    print("⚠️ lab.csv not found, skipping labs.")
    df_labs = pd.DataFrame(columns=['patientunitstayid'])

# --- 4. Merge Everything ---
print("Merging datasets...")
df_merged = df_patient.merge(df_vitals, on='patientunitstayid', how='left')
df_merged = df_merged.merge(df_labs, on='patientunitstayid', how='left')

print(f"✅ Data merged! Final shape: {df_merged.shape}")

# Save the master merged dataset
merged_path = os.path.join(PROCESSED_DIR, "merged_dataset.csv")
df_merged.to_csv(merged_path, index=False)
print(f"💾 Saved full merged dataset to: {merged_path}")

# --- 5. Federated Network Allocation Algorithm ---
print("\n⚖️ Running Greedy Allocation Algorithm to balance 6 Federated Networks...")

hosp_stats = df_merged.groupby('hospitalid').agg(
    total_patients=('hospitalid', 'count'),
    expired_patients=('mortality', 'sum')
).reset_index()

hosp_stats = hosp_stats.sort_values(by=['expired_patients', 'total_patients'], ascending=[False, False])

# Initialize 6 Networks
networks = [{'id': i, 'total_patients': 0, 'expired_patients': 0, 'hospitals': []} for i in range(6)]

for _, row in hosp_stats.iterrows():
    if row['expired_patients'] > 0:
        networks.sort(key=lambda x: (x['expired_patients'], x['total_patients']))
    else:
        networks.sort(key=lambda x: x['total_patients'])
        
    networks[0]['hospitals'].append(row['hospitalid'])
    networks[0]['total_patients'] += row['total_patients']
    networks[0]['expired_patients'] += row['expired_patients']

hospital_to_network = {}
for net in networks:
    print(f"Network {net['id']+1}: Hospitals={len(net['hospitals'])}, Total Patients={net['total_patients']}, Expired={net['expired_patients']}")
    for h_id in net['hospitals']:
        hospital_to_network[h_id] = net['id'] + 1

df_merged['network_id'] = df_merged['hospitalid'].map(hospital_to_network)

# --- 6. Save the Federated Splits ---
print("\n💾 Routing Federated Splits to respective folders...")
for i in range(1, 6):
    client_data = df_merged[df_merged['network_id'] == i]
    client_data = client_data.drop(columns=['network_id'])
    save_path = os.path.join(HOSPITALS_DIR, f"hospital_{i}.csv")
    client_data.to_csv(save_path, index=False)
    print(f"Saved Active Federated Client {i} -> {save_path} ({len(client_data)} patients)")

# Save the holdout dataset
onboard_data = df_merged[df_merged['network_id'] == 6]
onboard_data = onboard_data.drop(columns=['network_id'])
holdout_path = os.path.join(HOLDOUT_DIR, "hospital_onboarding.csv")
onboard_data.to_csv(holdout_path, index=False)
print(f"Saved Onboarding Client (Holdout) -> {holdout_path} ({len(onboard_data)} patients)")


# --- 7. Create Federation Registry ---
import json

REGISTRY_DIR = os.path.join(BASE_DIR, "registry")
os.makedirs(REGISTRY_DIR, exist_ok=True)

registry = {
    "hospitals": []
}

for i in range(1, 6):
    hospital_file = f"hospital_{i}.csv"
    hospital_path = os.path.join(HOSPITALS_DIR, hospital_file)
    patient_count = len(pd.read_csv(hospital_path))

    registry["hospitals"].append({
        "id": i,
        "file": hospital_file,
        "patients": int(patient_count),
        "active": True,
        "type": "core"
    })

registry_path = os.path.join(REGISTRY_DIR, "hospitals.json")

with open(registry_path, "w") as f:
    json.dump(registry, f, indent=4)

print(f"\n📘 Hospital registry created → {registry_path}")
print("✅ 5 hospitals initialized as active federation nodes.")

