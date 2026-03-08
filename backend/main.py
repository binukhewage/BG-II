import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import json

from federated.server import FederatedServer
from federated.onboarding import HospitalOnboarding
from federated.config import NUM_ROUNDS, FAIRNESS_LAMBDA
from federated.config import DP_ENABLED, NOISE_SCALE, CLIP_VALUE
from api.clinician import router as clinician_router

app = FastAPI()

app.include_router(clinician_router, prefix="/clinician")

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

    # ⭐ IMPORTANT: save trained model
    server_instance = bias_server

    # ----------------------------
    # Return Unified Results
    # ----------------------------
    return {
        "baseline": {
            "global_results": baseline_server.history[-1],
            "round_history": baseline_server.history,
            "hospital_metrics": baseline_server.last_round_hospital_metrics
        },
        "bias_aware": {
            "global_results": bias_server.history[-1],
            "round_history": bias_server.history,
            "hospital_metrics": bias_server.last_round_hospital_metrics
        },
        "active_hospitals": len(bias_server.get_active_hospital_paths()),

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

    global server_instance

    upload_path = os.path.join(BACKEND_DIR, "temp_upload.csv")

    # Save uploaded dataset
    with open(upload_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    onboarder = HospitalOnboarding(BACKEND_DIR)

    # -----------------------------------------
    # Step 1: Dataset Validation
    # -----------------------------------------
    try:
        onboarder.validate_dataset(upload_path)
    except Exception as e:
        return {
            "status": "rejected",
            "reason": str(e)
        }

    # -----------------------------------------
    # Step 2: Check Federation Started
    # -----------------------------------------
    if server_instance is None:
        return {
            "status": "error",
            "message": "Start federation first."
        }

    # -----------------------------------------
    # Step 3: Local Evaluation Using Global Model
    # -----------------------------------------
    global_weights = server_instance.global_model.state_dict()

    metrics = onboarder.evaluate_hospital(
        upload_path,
        global_weights
    )

    # -----------------------------------------
    # Step 4: Institutional Gate
    # -----------------------------------------
    approved, message = onboarder.institutional_gate(metrics)

    if not approved:
        return {
            "status": "rejected",
            "reason": message,
            "metrics": metrics
        }

    # -----------------------------------------
    # Step 5: Register Hospital
    # -----------------------------------------
    new_entry = onboarder.register_hospital(upload_path)

    print("\n🏥 New hospital approved and added to federation")
    print(f"Hospital ID: {new_entry['id']}")
    print("🔄 Continuing federated training...\n")

    # -----------------------------------------
    # Step 6: Continue Training (NOT Restart)
    # -----------------------------------------
    additional_rounds = NUM_ROUNDS

    start_round = len(server_instance.history) + 1
    end_round = start_round + additional_rounds - 1

    for r in range(start_round, end_round + 1):

        print(f"\n--- Round {r} (Post-Onboarding) ---")

        server_instance.run_single_round(r)

    print("\n✅ Federation successfully continued with new hospital\n")

    # -----------------------------------------
    # Step 7: Return Updated Federation State
    # -----------------------------------------
    return {
        "status": "approved",
        "hospital": new_entry,
        "metrics": metrics,
        "federation_update": {
            "round_history": server_instance.history,
            "global_results": server_instance.history[-1],
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

    # Keep only core hospitals
    registry["hospitals"] = [
        h for h in registry["hospitals"] if h["type"] == "core"
    ]

    with open(REGISTRY_PATH, "w") as f:
        json.dump(registry, f, indent=4)

    return {"message": "System reset to core hospitals"}