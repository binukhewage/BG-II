import os
import json
import shutil
import torch
import pandas as pd

from federated.client import FederatedClient
from federated.model import LogisticRegressionModel
from federated.config import INPUT_DIM

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

    # -----------------------------------------
    # 1. Validate Dataset Schema
    # -----------------------------------------
    def validate_dataset(self, csv_path):

        required_columns = [
            "age", "gender", "ethnicity",
            "mortality", "is_senior"
        ]

        df = pd.read_csv(csv_path)

        for col in required_columns:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")

        if df["mortality"].nunique() < 2:
            raise ValueError("Dataset must contain both classes.")

        return True

    # -----------------------------------------
    # 2. Local Evaluation
    # -----------------------------------------
    def evaluate_hospital(self, csv_path, global_weights):

        client = FederatedClient(csv_path)
        weights, metrics = client.train(global_weights=global_weights)

        return metrics

    # -----------------------------------------
    # 3. Institutional Gate
    # -----------------------------------------
    def institutional_gate(self, metrics,
                           min_auc=0.60,
                           max_dp=0.80,
                           max_eo=0.80):

        if metrics["auc"] < min_auc:
            return False, "Rejected: AUC below threshold"

        if metrics["demographic_parity"] > max_dp:
            return False, "Rejected: Demographic parity too high"

        if metrics["equal_opportunity"] > max_eo:
            return False, "Rejected: Equal opportunity too high"

        return True, "Approved"

    # -----------------------------------------
    # 4. Register Hospital
    # -----------------------------------------
    def register_hospital(self, csv_path):

        with open(self.registry_path, "r") as f:
            registry = json.load(f)

        new_id = max(h["id"] for h in registry["hospitals"]) + 1
        filename = f"hospital_{new_id}.csv"

        # Copy file to hospitals directory
        destination = os.path.join(self.hospitals_dir, filename)
        shutil.copy(csv_path, destination)

        # Count patients
        df = pd.read_csv(destination)

        new_entry = {
            "id": new_id,
            "file": filename,
            "patients": len(df),
            "active": True,
            "type": "onboarded"
        }

        registry["hospitals"].append(new_entry)

        with open(self.registry_path, "w") as f:
            json.dump(registry, f, indent=4)

        return new_entry