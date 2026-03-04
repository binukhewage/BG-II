import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import json

from federated.server import FederatedServer
from federated.onboarding import HospitalOnboarding
from federated.config import NUM_ROUNDS, FAIRNESS_LAMBDA
from federated.config import DP_ENABLED, NOISE_SCALE, CLIP_VALUE

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTRY_PATH = os.path.join(BACKEND_DIR, "data", "registry", "hospitals.json")

# Global server instance
server_instance = None


# -----------------------------------------
# Start Federation
# -----------------------------------------
@app.post("/start-federation")
def start_federation():

    global server_instance

    # ----------------------------
    # Baseline (Standard FedAvg)
    # ----------------------------
    baseline_server = FederatedServer(
        backend_dir=BACKEND_DIR,
        num_rounds=NUM_ROUNDS,
        fairness_lambda=0.0
    )
    baseline_server.train()

    # ----------------------------
    # Bias-Aware FedAvg (Ours)
    # ----------------------------
    bias_server = FederatedServer(
        backend_dir=BACKEND_DIR,
        num_rounds=NUM_ROUNDS,
        fairness_lambda=FAIRNESS_LAMBDA
    )
    bias_server.train()

    # ----------------------------
    # Return Unified Results
    # ----------------------------
    return {
        "baseline": {
            "global_results": baseline_server.history[-1],
            "round_history": baseline_server.history
        },
        "bias_aware": {
            "global_results": bias_server.history[-1],
            "round_history": bias_server.history,
            "hospital_metrics": bias_server.last_round_hospital_metrics
        },
        "active_hospitals": len(bias_server.get_active_hospital_paths()),

        # 🔐 Privacy Configuration
        "privacy": {
            "enabled": DP_ENABLED,
            "noise_scale": NOISE_SCALE if DP_ENABLED else None,
            "clip_value": CLIP_VALUE if DP_ENABLED else None
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

    upload_path = os.path.join(BACKEND_DIR, "temp_upload.csv")

    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    onboarder = HospitalOnboarding(BACKEND_DIR)

    # Validate
    onboarder.validate_dataset(upload_path)

    # Use current global model if exists
    if server_instance is None:
        return {"error": "Start federation first."}

    global_weights = server_instance.global_model.state_dict()

    # Evaluate
    metrics = onboarder.evaluate_hospital(upload_path, global_weights)

    # Gate
    approved, message = onboarder.institutional_gate(metrics)

    if not approved:
        return {
            "status": "rejected",
            "reason": message,
            "metrics": metrics
        }

    # Register
    new_entry = onboarder.register_hospital(upload_path)

    return {
        "status": "approved",
        "hospital": new_entry,
        "metrics": metrics
    }


# -----------------------------------------
# Reset Federation
# -----------------------------------------
@app.post("/reset")
def reset_system():

    with open(REGISTRY_PATH, "r") as f:
        registry = json.load(f)

    # Keep only core hospitals
    registry["hospitals"] = [
        h for h in registry["hospitals"] if h["type"] == "core"
    ]

    with open(REGISTRY_PATH, "w") as f:
        json.dump(registry, f, indent=4)

    return {"message": "System reset to core hospitals"}