import pandas as pd
import os
from sdv.single_table import CTGANSynthesizer
from sdv.metadata import SingleTableMetadata

# Get project base directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_PATH = os.path.join(
    BASE_DIR,
    "holdout",
    "hospital_onboarding.csv"
)

print("Loading dataset from:", DATA_PATH)

df = pd.read_csv(DATA_PATH)

# Define metadata automatically
metadata = SingleTableMetadata()
metadata.detect_from_dataframe(df)

# Initialize CTGAN model
synthesizer = CTGANSynthesizer(metadata)

print("Training CTGAN model...")
synthesizer.fit(df)

print("Generating synthetic hospitals...")

num_hospitals = 5
patients_per_hospital = 800

for i in range(num_hospitals):

    synthetic_data = synthesizer.sample(patients_per_hospital)

    synthetic_data.to_csv(
        f"synthetic_hospital_{i+1}.csv",
        index=False
    )

print("Done. Synthetic hospitals created.")