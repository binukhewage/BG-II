import os
import json
import shutil
import torch
import pandas as pd

from federated.client import FederatedClient

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class HospitalOnboarding:

    def __init__(self, backend_dir):

        self.backend_dir = backend_dir

        self.registry_path = os.path.join(
            backend_dir, "data", "registry", "hospitals.json"
        )

        self.hospitals_dir = os.path.join(
            backend_dir, "data", "hospitals"
        )

    # ---------------------------------------------------
    # 1. Dataset Validation
    # ---------------------------------------------------
    def validate_dataset(self, csv_path):

        required_columns = [
            "age",
            "gender",
            "ethnicity",
            "mortality",
            "is_senior"
        ]

        df = pd.read_csv(csv_path)

        # Check columns
        for col in required_columns:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")

        # Minimum sample size
        if len(df) < 100:
            raise ValueError("Dataset too small (<100 samples)")

        # Mortality distribution check
        if df["mortality"].nunique() < 2:
            raise ValueError("Dataset must contain both mortality classes")

        # Missing value check
        missing_ratio = df.isnull().mean().mean()

        if missing_ratio > 0.30:
            raise ValueError("Too many missing values (>30%)")

        return True

    # ---------------------------------------------------
    # 2. Local Simulation
    # ---------------------------------------------------
    def evaluate_hospital(self, csv_path, global_weights):

        try:

            client = FederatedClient(csv_path)

            weights, metrics = client.train(
                global_weights=global_weights
            )

            return metrics

        except Exception as e:

            raise RuntimeError(
                f"Hospital evaluation failed: {str(e)}"
            )

    # ---------------------------------------------------
    # 3. Institutional Approval Gate
    # ---------------------------------------------------
    def institutional_gate(
        self,
        metrics,
        min_auc=0.60,
        max_dp=0.80,
        max_eo=0.80
    ):

        auc = metrics["auc"]
        dp = metrics["demographic_parity"]
        eo = metrics["equal_opportunity"]

        if auc < min_auc:
            return False, "Rejected: AUC below threshold"

        if dp > max_dp:
            return False, "Rejected: Demographic parity too high"

        if eo > max_eo:
            return False, "Rejected: Equal opportunity too high"

        return True, "Approved"

    # ---------------------------------------------------
    # 4. Register Hospital
    # ---------------------------------------------------
    def register_hospital(self, csv_path):

        with open(self.registry_path, "r") as f:
            registry = json.load(f)

        hospitals = registry["hospitals"]

        # Determine new hospital ID safely
        new_id = len(hospitals) + 1
        filename = f"hospital_{new_id}.csv"

        destination = os.path.join(self.hospitals_dir, filename)

        shutil.copy(csv_path, destination)

        df = pd.read_csv(destination)

        new_entry = {
            "id": new_id,
            "file": filename,
            "patients": len(df),
            "active": True,
            "type": "onboarded"
        }

        hospitals.append(new_entry)

        with open(self.registry_path, "w") as f:
            json.dump(registry, f, indent=4)

        print(f"🏥 Hospital {new_id} registered")

        return new_entry