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

TARGET_COLUMN = "mortality"
PROTECTED_ATTRIBUTE = "is_senior"

INPUT_DIM = len(MODEL_FEATURES)

LOCAL_EPOCHS = 1
LEARNING_RATE = 0.01
NUM_ROUNDS = 20

FAIRNESS_LAMBDA = 15.0
DP_SIGMA = 0.002
MAX_GRAD_NORM = 1.0

# Differential Privacy Settings


DP_ENABLED = True  # Set to True to enable DP, False to disable

CLIP_VALUE = 1.0        # Gradient clipping bound
NOISE_SCALE = 0.002      # Gaussian noise std