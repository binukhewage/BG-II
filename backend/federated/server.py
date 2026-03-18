import os
import json
import torch
import numpy as np
from copy import deepcopy

from federated.client import FederatedClient
from federated.model import LogisticRegressionModel
from federated.config import (
    INPUT_DIM,
    DP_ENABLED, NOISE_SCALE, CLIP_VALUE,
    FAIRNESS_LAMBDA, FAIRNESS_PENALTY_MODE, BIAS_REJECTION_THRESHOLD
)

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
        self._last_rejection_count = 0
        self._last_fairness_weights = []

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
    # Standard FedAvg (unchanged)
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
    # Compute Fairness Weight for a Single Client (NEW)
    # Centralises penalty logic so it can be switched
    # via FAIRNESS_PENALTY_MODE in config
    # ---------------------------------------------------
    def _compute_fairness_weight(self, sample_size, bias_score):

        # Hard rejection — zero weight if bias exceeds threshold
        if bias_score > BIAS_REJECTION_THRESHOLD:
            return 0.0

        if FAIRNESS_PENALTY_MODE == "inverse":
            # 1 / (1 + lambda * bias)
            # Stays meaningful at high bias values
            # unlike exponential which collapses near zero
            penalty = 1.0 / (1.0 + self.fairness_lambda * bias_score)

        elif FAIRNESS_PENALTY_MODE == "quadratic":
            # 1 / (1 + lambda * bias^2)
            penalty = 1.0 / (1.0 + self.fairness_lambda * (bias_score ** 2))

        else:
            # Default: original exponential
            # exp(-lambda * bias) — kept for backward compatibility
            penalty = np.exp(-self.fairness_lambda * bias_score)

        return sample_size * penalty

    # ---------------------------------------------------
    # Bias-Aware FedAvg (UPDATED)
    # Now uses config-driven penalty mode and
    # hard rejection threshold
    # ---------------------------------------------------
    def bias_aware_fed_avg(self,
                           client_weights,
                           client_sizes,
                           client_biases):

        fairness_weights = []
        accepted = []

        for i in range(len(client_sizes)):
            w = self._compute_fairness_weight(client_sizes[i], client_biases[i])
            fairness_weights.append(w)
            accepted.append(w > 0)

        total_weight = sum(fairness_weights)

        # Fallback: if ALL clients were rejected (extreme edge case),
        # use standard FedAvg to avoid division by zero
        if total_weight == 0:
            print("⚠️  All clients rejected by bias threshold — falling back to FedAvg")
            self._last_rejection_count = len(client_sizes)
            self._last_fairness_weights = [0.0] * len(client_sizes)
            return self.fed_avg(client_weights, client_sizes)

        # Store rejection info for dashboard
        num_rejected = sum(1 for a in accepted if not a)
        self._last_rejection_count = num_rejected
        self._last_fairness_weights = [
            round(w / total_weight, 4) for w in fairness_weights
        ]

        if num_rejected > 0:
            print(f"  🚫 Hard rejected {num_rejected} client(s) with bias > {BIAS_REJECTION_THRESHOLD}")

        new_state_dict = deepcopy(client_weights[0])

        for key in new_state_dict.keys():
            new_state_dict[key] = sum(
                client_weights[i][key] *
                (fairness_weights[i] / total_weight)
                for i in range(len(client_weights))
            )

        return new_state_dict

    # ---------------------------------------------------
    # Single Round Execution
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

        # Pass last round's avg DP to clients so adaptive fairness
        # weight scales correctly. Round 1 uses 0.7 as starting estimate
        # (matches observed round-1 baseline DP of ~0.686).
        # Baseline server has fairness_lambda=0 so current_dp is ignored.
        if self.history:
            current_dp = self.history[-1]["avg_dp"]
        else:
            current_dp = 0.7  # high estimate for round 1

        for path in hospital_paths:

            client = FederatedClient(path)

            weights, metrics = client.train(
                global_weights=global_weights,
                current_dp=current_dp if self.fairness_lambda > 0 else None
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

        # ---------------------------------------------------
        # Aggregation
        # ---------------------------------------------------
        if self.fairness_lambda == 0:
            new_weights = self.fed_avg(client_weights, client_sizes)
            self._last_rejection_count = 0
            self._last_fairness_weights = []
            print("Using Standard FedAvg")
        else:
            new_weights = self.bias_aware_fed_avg(
                client_weights,
                client_sizes,
                client_biases
            )
            print(f"Using Bias-Aware FedAvg (mode: {FAIRNESS_PENALTY_MODE})")

        self.global_model.load_state_dict(new_weights)

        round_avg_auc = np.mean(client_aucs)
        round_avg_dp = np.mean(client_biases)
        round_avg_eo = np.mean(client_eos)

        self.history.append({
            "round":           round_num,
            "avg_auc":         float(round_avg_auc),
            "avg_dp":          float(round_avg_dp),
            "avg_eo":          float(round_avg_eo),
            "rejected_count":  self._last_rejection_count,
            "fairness_weights": list(self._last_fairness_weights),
        })

        self.last_round_hospital_metrics = []

        for i, path in enumerate(hospital_paths):
            fw = self._last_fairness_weights
            self.last_round_hospital_metrics.append({
                "hospital":        os.path.basename(path),
                "auc":             float(client_aucs[i]),
                "dp":              float(client_biases[i]),
                "dp_direction":    float(client_dp_dirs[i]),
                "senior_rate":     float(client_senior_rates[i]),
                "non_senior_rate": float(client_non_senior_rates[i]),
                "eo":              float(client_eos[i]),
                "samples":         int(client_sizes[i]),
                "rejected":        bool(fw[i] == 0.0) if fw else False,
                "fairness_weight": float(fw[i]) if fw else 1.0,
            })

        print(f"\nRound {round_num} Summary:")
        print(f"Avg AUC: {round_avg_auc:.3f}")
        print(f"Avg DP:  {round_avg_dp:.3f}")
        print(f"Avg EO:  {round_avg_eo:.3f}")

    # ---------------------------------------------------
    # Full Federated Training
    # ---------------------------------------------------
    def train(self):

        print("\n🚀 Starting Federated Training")

        if DP_ENABLED:
            print(f"🔐 Differential Privacy: ENABLED")
            print(f"   Noise Scale : {NOISE_SCALE}")
            print(f"   Clip Value  : {CLIP_VALUE}")
        else:
            print("🔓 Differential Privacy: DISABLED")

        if self.fairness_lambda > 0:
            print(f"⚖️  Bias-Aware Mode: ENABLED")
            print(f"   Penalty Mode       : {FAIRNESS_PENALTY_MODE}")
            print(f"   Rejection Threshold: {BIAS_REJECTION_THRESHOLD}")

        start_round = len(self.history) + 1
        end_round = start_round + self.num_rounds - 1

        for round_num in range(start_round, end_round + 1):
            self.run_single_round(round_num)

        print("\n✅ Federated Training Complete")