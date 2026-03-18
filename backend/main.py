import os
import random
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import json
import torch

from federated.server import FederatedServer
from federated.onboarding import HospitalOnboarding
from federated.config import NUM_ROUNDS, FAIRNESS_LAMBDA
from federated.config import DP_ENABLED, NOISE_SCALE, CLIP_VALUE

from api.clinician import router as clinician_router, load_global_model

# -----------------------------------------
# Global seed — called before EACH experiment
# so both baseline and BiasGuard start from
# IDENTICAL blank model weights.
# Standard ML research practice for reproducibility.
# -----------------------------------------
GLOBAL_SEED = 42

def set_seed(seed=GLOBAL_SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

set_seed()

app = FastAPI()
app.include_router(clinician_router, prefix="/clinician")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_DIR   = os.path.dirname(os.path.abspath(__file__))
REGISTRY_PATH = os.path.join(BACKEND_DIR, "data", "registry", "hospitals.json")
MODEL_DIR     = os.path.join(BACKEND_DIR, "models")
MODEL_PATH    = os.path.join(MODEL_DIR, "global_model.pt")

# Global server instance (bias-aware) kept for onboarding
server_instance = None


# -----------------------------------------
# Start Federation
# -----------------------------------------
@app.post("/start-federation")
def start_federation():

    global server_instance

    # -------------------------------------------------------
    # EXPERIMENT 1: Standard FedAvg (Baseline)
    #
    # Blank model, no fairness mechanisms, NUM_ROUNDS rounds.
    # Seed reset ensures identical starting weights to E2.
    # -------------------------------------------------------
    set_seed()
    print("\n=== EXPERIMENT 1: Standard FedAvg (Baseline) ===")

    baseline_server = FederatedServer(
        backend_dir=BACKEND_DIR,
        num_rounds=NUM_ROUNDS,
        fairness_lambda=0.0
    )
    baseline_server.train()

    # -------------------------------------------------------
    # EXPERIMENT 2: BiasGuard Bias-Aware FedAvg
    #
    # Also starts from a BLANK model — same seed = same
    # initial weights as baseline. Controlled comparison:
    # both face the same high-bias starting point (~DP 0.34
    # round 1). Research question: does BiasGuard converge
    # to lower bias faster over the same NUM_ROUNDS?
    #
    # NO weight inheritance from baseline — that was wrong
    # because it gave BiasGuard a pre-solved model with
    # almost no bias left to reduce, making the comparison
    # meaningless.
    # -------------------------------------------------------
    set_seed()
    print("\n=== EXPERIMENT 2: BiasGuard Bias-Aware FedAvg ===")

    bias_server = FederatedServer(
        backend_dir=BACKEND_DIR,
        num_rounds=NUM_ROUNDS,
        fairness_lambda=FAIRNESS_LAMBDA
    )
    bias_server.train()

    # -------------------------------------------------------
    # Save final bias-aware model for clinician endpoint
    # -------------------------------------------------------
    os.makedirs(MODEL_DIR, exist_ok=True)
    torch.save(bias_server.global_model.state_dict(), MODEL_PATH)
    print(f"\n💾 Global model saved to {MODEL_PATH}")

    # Reload clinician model immediately — no restart needed
    load_global_model()
    print("[clinician] Model reloaded with new federation weights")

    server_instance = bias_server

    return {
        "baseline": {
            "global_results":   baseline_server.history[-1],
            "round_history":    baseline_server.history,
            "hospital_metrics": baseline_server.last_round_hospital_metrics
        },
        "bias_aware": {
            "global_results":   bias_server.history[-1],
            "round_history":    bias_server.history,
            "hospital_metrics": bias_server.last_round_hospital_metrics
        },
        "active_hospitals": len(bias_server.get_active_hospital_paths()),
        "privacy": {
            "enabled":     DP_ENABLED,
            "noise_scale": NOISE_SCALE if DP_ENABLED else None,
            "clip_value":  CLIP_VALUE  if DP_ENABLED else None
        }
    }


# -----------------------------------------
# Get Current Registry
# -----------------------------------------
@app.get("/hospitals")
def get_hospitals():
    with open(REGISTRY_PATH, "r") as f:
        return json.load(f)


# -----------------------------------------
# Onboard New Hospital
# -----------------------------------------
@app.post("/onboard")
def onboard_hospital(file: UploadFile = File(...)):

    global server_instance

    upload_path = os.path.join(BACKEND_DIR, "temp_upload.csv")

    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    onboarder = HospitalOnboarding(BACKEND_DIR)

    # Step 1: Validate
    try:
        onboarder.validate_dataset(upload_path)
    except Exception as e:
        return {"status": "rejected", "reason": str(e)}

    # Step 2: Check federation started
    if server_instance is None:
        return {"status": "error", "message": "Start federation first."}

    # Step 3: Evaluate against global model
    global_weights         = server_instance.global_model.state_dict()
    metrics                = onboarder.evaluate_hospital(upload_path, global_weights)

    # Step 4: Institutional gate
    approved, message      = onboarder.institutional_gate(metrics)
    if not approved:
        return {"status": "rejected", "reason": message, "metrics": metrics}

    # Step 5: Register
    new_entry = onboarder.register_hospital(upload_path)

    print("\n🏥 New hospital approved and added to federation")
    print(f"Hospital ID: {new_entry['id']}")
    print("🔄 Continuing federated training...\n")

    # Step 6: Continue training with new hospital included
    start_round = len(server_instance.history) + 1
    end_round   = start_round + NUM_ROUNDS - 1

    for r in range(start_round, end_round + 1):
        print(f"\n--- Round {r} (Post-Onboarding) ---")
        server_instance.run_single_round(r)

    # Save updated model and reload clinician immediately
    os.makedirs(MODEL_DIR, exist_ok=True)
    torch.save(server_instance.global_model.state_dict(), MODEL_PATH)
    load_global_model()

    print("\n✅ Federation successfully continued with new hospital\n")

    return {
        "status":   "approved",
        "hospital": new_entry,
        "metrics":  metrics,
        "federation_update": {
            "round_history":    server_instance.history,
            "global_results":   server_instance.history[-1],
            "hospital_metrics": server_instance.last_round_hospital_metrics,
            "active_hospitals": len(server_instance.get_active_hospital_paths())
        }
    }


# -----------------------------------------
# Reset Federation
# -----------------------------------------
@app.post("/reset")
def reset_system():

    with open(REGISTRY_PATH, "r") as f:
        registry = json.load(f)

    registry["hospitals"] = [
        h for h in registry["hospitals"] if h["type"] == "core"
    ]

    with open(REGISTRY_PATH, "w") as f:
        json.dump(registry, f, indent=4)

    # Remove saved model so clinician endpoint
    # doesn't serve stale weights after reset
    if os.path.exists(MODEL_PATH):
        os.remove(MODEL_PATH)
        print("🗑️  Removed stale global model")

    return {"message": "System reset to core hospitals"}