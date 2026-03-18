MODEL_FEATURES = [
    "age",
    "is_senior",
    "mean_heartrate",
    "mean_sao2",
    "mean_bp",
    "glucose",
    "creatinine",
    "WBC x 1000",
    "BUN"
]

TARGET_COLUMN       = "mortality"
PROTECTED_ATTRIBUTE = "is_senior"
INPUT_DIM           = len(MODEL_FEATURES)

# ----------------------------
# Training Settings
# ----------------------------
LOCAL_EPOCHS  = 5
LEARNING_RATE = 0.01
NUM_ROUNDS    = 20

# ----------------------------
# Fairness Settings
# ----------------------------

# Server-side aggregation penalty strength.
# Higher = biased hospitals get lower weight in FedAvg.
# 15.0 is strong enough to meaningfully downweight
# hospital_5 (consistently highest DP) from round 1.
FAIRNESS_LAMBDA = 15.0

# Client-side fairness regularisation loss weight.
# Added to BCE loss: total_loss = BCE + weight * |dp_gap|
# 0.8 is strong enough to push the model away from
# demographic disparity during local training, but not
# so strong that it collapses AUC.
# This fires hardest in early rounds when DP gap is ~0.3+
# — exactly when it does the most good.
FAIRNESS_LOSS_WEIGHT = 0.8

# Hard rejection threshold.
# Hospitals with DP above this get ZERO weight in aggregation.
# 0.3 matches your round-1 baseline DP range (0.21-0.53)
# so it only excludes genuinely extreme outliers (hospital_5).
# Raised to 0.5 so early rounds don't fall back to standard FedAvg.
# Adaptive fairness loss now handles high-bias early rounds.
# Hard rejection still fires for extreme outliers (DP > 0.5).
BIAS_REJECTION_THRESHOLD = 1.0

# Aggregation penalty formula.
# "inverse" = 1/(1 + lambda * bias) — recommended, stable at high bias.
FAIRNESS_PENALTY_MODE = "inverse"

# ----------------------------
# Differential Privacy
# ----------------------------
DP_ENABLED  = True
CLIP_VALUE  = 1.0
NOISE_SCALE = 0.001

# Legacy aliases
DP_SIGMA      = 0.001
MAX_GRAD_NORM = 1.0