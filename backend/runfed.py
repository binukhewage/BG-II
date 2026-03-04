import os
import sys
import torch
import numpy as np
import random

def set_seed(seed=42):
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)
    random.seed(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

set_seed(42)

# Absolute backend path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Allow imports from backend/
sys.path.append(BACKEND_DIR)

from federated.server import FederatedServer
from federated.config import NUM_ROUNDS, FAIRNESS_LAMBDA


print("=========================================================")
print("🧪 EXPERIMENT 1: STANDARD FEDERATED LEARNING (Baseline)")
print("=========================================================")

# fairness_lambda = 0 → Standard FedAvg
server_baseline = FederatedServer(
    backend_dir=BACKEND_DIR,
    num_rounds=NUM_ROUNDS,
    fairness_lambda=0.0
)

server_baseline.train()


print("\n=========================================================")
print("🛡️ EXPERIMENT 2: BIAS-AWARE FEDERATED LEARNING (Proposed)")
print("=========================================================")

# fairness_lambda > 0 → Bias-Aware FedAvg
server_bias_aware = FederatedServer(
    backend_dir=BACKEND_DIR,
    num_rounds=NUM_ROUNDS,
    fairness_lambda=FAIRNESS_LAMBDA
)

server_bias_aware.train()


# ---------------------------------------------------
# Final Comparison
# ---------------------------------------------------
baseline_final = server_baseline.history[-1]
proposed_final = server_bias_aware.history[-1]

print("\n📊 FINAL EXPERIMENT RESULTS")
print("-" * 60)
print(f"{'Metric':<15}| {'Standard FedAvg':<20}| {'Bias-Aware (Ours)':<20}")
print("-" * 60)
print(f"{'Average AUC':<15}| {baseline_final['avg_auc']:<20.4f}| {proposed_final['avg_auc']:<20.4f}")
print(f"{'Average DP':<15}| {baseline_final['avg_dp']:<20.4f}| {proposed_final['avg_dp']:<20.4f}  <-- Lower better")
print(f"{'Average EO':<15}| {baseline_final['avg_eo']:<20.4f}| {proposed_final['avg_eo']:<20.4f}  <-- Lower better")
print("-" * 60)