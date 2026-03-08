import os
import json
import torch
import numpy as np
from copy import deepcopy

from federated.client import FederatedClient
from federated.model import LogisticRegressionModel
from federated.config import INPUT_DIM
from federated.config import DP_ENABLED, NOISE_SCALE, CLIP_VALUE

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class FederatedServer:

    def __init__(self, backend_dir, num_rounds=10, fairness_lambda=0.0):

        self.backend_dir = backend_dir
        self.num_rounds = num_rounds
        self.fairness_lambda = fairness_lambda

        self.registry_path = os.path.join(
            backend_dir,
            "data",
            "registry",
            "hospitals.json"
        )

        self.global_model = LogisticRegressionModel(INPUT_DIM).to(DEVICE)

        self.history = []
        self.last_round_hospital_metrics = []

    # ---------------------------------------------------
    # Load Active Hospitals
    # ---------------------------------------------------
    def get_active_hospital_paths(self):

        with open(self.registry_path, "r") as f:
            registry = json.load(f)

        hospitals = registry.get("hospitals", [])

        active = [
            h for h in hospitals
            if h.get("active", True)
        ]

        paths = [
            os.path.join(
                self.backend_dir,
                "data",
                "hospitals",
                h["file"]
            )
            for h in active
        ]

        return paths

    # ---------------------------------------------------
    # Standard FedAvg
    # ---------------------------------------------------
    def fed_avg(self, client_weights, client_sizes):

        new_state_dict = deepcopy(client_weights[0])
        total_samples = sum(client_sizes)

        for key in new_state_dict.keys():

            new_state_dict[key] = sum(
                client_weights[i][key] *
                (client_sizes[i] / total_samples)
                for i in range(len(client_weights))
            )

        return new_state_dict

    # ---------------------------------------------------
    # Bias-Aware FedAvg
    # ---------------------------------------------------
    def bias_aware_fed_avg(self,
                           client_weights,
                           client_sizes,
                           client_biases):

        new_state_dict = deepcopy(client_weights[0])

        fairness_weights = []

        for i in range(len(client_sizes)):

            penalty = np.exp(
                -self.fairness_lambda *
                client_biases[i]
            )

            fairness_weights.append(
                client_sizes[i] * penalty
            )

        total_weight = sum(fairness_weights)

        for key in new_state_dict.keys():

            new_state_dict[key] = sum(
                client_weights[i][key] *
                (fairness_weights[i] / total_weight)
                for i in range(len(client_weights))
            )

        return new_state_dict

    # ---------------------------------------------------
    # SINGLE ROUND EXECUTION (NEW)
    # ---------------------------------------------------
    def run_single_round(self, round_num):

        print(f"\n--- Round {round_num} ---")

        client_weights = []
        client_sizes = []
        client_biases = []
        client_dp_dirs = []
        client_aucs = []
        client_eos = []
        
        client_senior_rates = []
        client_non_senior_rates = []

        global_weights = self.global_model.state_dict()

        hospital_paths = self.get_active_hospital_paths()

        print(f"Active Hospitals: {len(hospital_paths)}")

        for path in hospital_paths:

            client = FederatedClient(path)

            weights, metrics = client.train(
                global_weights=global_weights
            )

            client_weights.append(weights)
            client_sizes.append(metrics["samples"])
            client_biases.append(metrics["demographic_parity"])
            client_dp_dirs.append(metrics["dp_gap_direction"])
            client_aucs.append(metrics["auc"])
            client_eos.append(metrics["equal_opportunity"])
            client_senior_rates.append(metrics["senior_positive_rate"])
            client_non_senior_rates.append(metrics["non_senior_positive_rate"])

            print(
                f"{os.path.basename(path)} | "
                f"AUC: {metrics['auc']:.3f} | "
                f"DP: {metrics['demographic_parity']:.3f} | "
                f"EO: {metrics['equal_opportunity']:.3f}"
            )

        # Aggregation
        if self.fairness_lambda == 0:

            new_weights = self.fed_avg(
                client_weights,
                client_sizes
            )

            print("Using Standard FedAvg")

        else:

            new_weights = self.bias_aware_fed_avg(
                client_weights,
                client_sizes,
                client_biases
            )

            print("Using Bias-Aware FedAvg")

        self.global_model.load_state_dict(new_weights)

        round_avg_auc = np.mean(client_aucs)
        round_avg_dp = np.mean(client_biases)
        round_avg_eo = np.mean(client_eos)

        self.history.append({
            "round": round_num,
            "avg_auc": float(round_avg_auc),
            "avg_dp": float(round_avg_dp),
            "avg_eo": float(round_avg_eo)
        })

        self.last_round_hospital_metrics = []

        for i, path in enumerate(hospital_paths):

            self.last_round_hospital_metrics.append({
                "hospital": os.path.basename(path),

                "auc": float(client_aucs[i]),

                "dp": float(client_biases[i]),
                "dp_direction": float(client_dp_dirs[i]),

                "senior_rate": float(client_senior_rates[i]),
                "non_senior_rate": float(client_non_senior_rates[i]),

                "eo": float(client_eos[i]),
                "samples": int(client_sizes[i])
            })

        print(f"\nRound {round_num} Summary:")
        print(f"Avg AUC: {round_avg_auc:.3f}")
        print(f"Avg DP: {round_avg_dp:.3f}")
        print(f"Avg EO: {round_avg_eo:.3f}")

    # ---------------------------------------------------
    # Federated Training
    # ---------------------------------------------------
    def train(self):

        print("\n🚀 Starting Federated Training")

        if DP_ENABLED:
            print("🔐 Differential Privacy: ENABLED")
            print(f"Noise Scale: {NOISE_SCALE}")
            print(f"Gradient Clip Value: {CLIP_VALUE}")
        else:
            print("🔓 Differential Privacy: DISABLED")

        start_round = len(self.history) + 1
        end_round = start_round + self.num_rounds - 1

        for round_num in range(start_round, end_round + 1):

            self.run_single_round(round_num)

        print("\n✅ Federated Training Complete")