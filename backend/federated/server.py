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
        """
        backend_dir: absolute path to backend folder
        """
        self.backend_dir = backend_dir
        self.num_rounds = num_rounds
        self.fairness_lambda = fairness_lambda

        self.registry_path = os.path.join(
            backend_dir, "data", "registry", "hospitals.json"
        )

        self.global_model = LogisticRegressionModel(INPUT_DIM).to(DEVICE)

        # 🔹 Global round history (for graphs)
        self.history = []

        # 🔹 Final round per-hospital metrics (for table)
        self.last_round_hospital_metrics = []

    # ---------------------------------------------------
    # Load active hospital paths dynamically
    # ---------------------------------------------------
    def get_active_hospital_paths(self):

        with open(self.registry_path, "r") as f:
            registry = json.load(f)

        active_hospitals = [
            h for h in registry["hospitals"] if h["active"] is True
        ]

        paths = [
            os.path.join(
                self.backend_dir,
                "data",
                "hospitals",
                h["file"]
            )
            for h in active_hospitals
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
                client_weights[i][key] * (client_sizes[i] / total_samples)
                for i in range(len(client_weights))
            )

        return new_state_dict

    # ---------------------------------------------------
    # Bias-Aware FedAvg
    # ---------------------------------------------------
    def bias_aware_fed_avg(self, client_weights, client_sizes, client_biases):

        new_state_dict = deepcopy(client_weights[0])

        fairness_weights = []

        for i in range(len(client_sizes)):
            penalty = np.exp(-self.fairness_lambda * client_biases[i])
            fairness_weights.append(client_sizes[i] * penalty)

        total_weight = sum(fairness_weights)

        for key in new_state_dict.keys():
            new_state_dict[key] = sum(
                client_weights[i][key] * (fairness_weights[i] / total_weight)
                for i in range(len(client_weights))
            )

        return new_state_dict

    # ---------------------------------------------------
    # Federated Training Loop
    # ---------------------------------------------------
    def train(self):

        print("\n🚀 Starting Federated Training\n")

        if DP_ENABLED:
            print("🔐 Differential Privacy: ENABLED")
            print(f"Noise Scale: {NOISE_SCALE}")
            print(f"Gradient Clip Value: {CLIP_VALUE}")
        else:
            print("🔓 Differential Privacy: DISABLED")

        # 🔹 Reset tracking each time federation runs
        self.history = []
        self.last_round_hospital_metrics = []

        for round_num in range(1, self.num_rounds + 1):

            print(f"\n--- Round {round_num} ---")

            client_weights = []
            client_sizes = []
            client_biases = []
            client_aucs = []
            client_eos = []

            global_weights = self.global_model.state_dict()

            hospital_paths = self.get_active_hospital_paths()

            print(f"Active Hospitals: {len(hospital_paths)}")

            # Local training
            for path in hospital_paths:

                client = FederatedClient(path)
                weights, metrics = client.train(global_weights=global_weights)

                client_weights.append(weights)
                client_sizes.append(metrics["samples"])
                client_biases.append(metrics["demographic_parity"])
                client_aucs.append(metrics["auc"])
                client_eos.append(metrics["equal_opportunity"])

                print(
                    f"{os.path.basename(path)} | "
                    f"AUC: {metrics['auc']:.3f} | "
                    f"DP: {metrics['demographic_parity']:.3f} | "
                    f"EO: {metrics['equal_opportunity']:.3f}"
                )

            # Aggregation
            if self.fairness_lambda == 0:
                new_weights = self.fed_avg(client_weights, client_sizes)
                print("Using Standard FedAvg")
            else:
                new_weights = self.bias_aware_fed_avg(
                    client_weights,
                    client_sizes,
                    client_biases
                )
                print("Using Bias-Aware FedAvg")

            self.global_model.load_state_dict(new_weights)

            # Logging global averages
            round_avg_auc = np.mean(client_aucs)
            round_avg_dp = np.mean(client_biases)
            round_avg_eo = np.mean(client_eos)

            self.history.append({
                "round": round_num,
                "avg_auc": float(round_avg_auc),
                "avg_dp": float(round_avg_dp),
                "avg_eo": float(round_avg_eo)
            })

            # 🔹 Store final round hospital metrics
            if round_num == self.num_rounds:
                for i, path in enumerate(hospital_paths):
                    self.last_round_hospital_metrics.append({
                        "hospital": os.path.basename(path),
                        "auc": float(client_aucs[i]),
                        "dp": float(client_biases[i]),
                        "eo": float(client_eos[i]),
                        "samples": int(client_sizes[i])
                    })

            print(f"\nRound {round_num} Summary:")
            print(f"Avg AUC: {round_avg_auc:.3f}")
            print(f"Avg DP: {round_avg_dp:.3f}")
            print(f"Avg EO: {round_avg_eo:.3f}")

        print("\n✅ Federated Training Complete")