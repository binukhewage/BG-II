import torch
import torch.nn as nn
import pandas as pd
import numpy as np
import random

from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score

from federated.model import LogisticRegressionModel
from federated.config import MODEL_FEATURES, TARGET_COLUMN, PROTECTED_ATTRIBUTE, INPUT_DIM
from federated.config import DP_ENABLED, CLIP_VALUE, NOISE_SCALE

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# =============================
# Reproducibility (Viva Safe)
# =============================
def set_seed(seed=42):
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)
    random.seed(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class FederatedClient:
    def __init__(self, csv_path):
        self.csv_path = csv_path
        self.model = LogisticRegressionModel(INPUT_DIM).to(DEVICE)

    # -----------------------------------------
    # Load and Preprocess Data (Local Only)
    # -----------------------------------------
    def load_data(self):
        df = pd.read_csv(self.csv_path)

        X = df[MODEL_FEATURES].values
        y = df[TARGET_COLUMN].values
        protected = df[PROTECTED_ATTRIBUTE].values

        # Local Imputation
        imputer = SimpleImputer(strategy="median")
        X = imputer.fit_transform(X)

        # Local Standardization
        scaler = StandardScaler()
        X = scaler.fit_transform(X)

        X = torch.tensor(X, dtype=torch.float32).to(DEVICE)
        y = torch.tensor(y, dtype=torch.float32).unsqueeze(1).to(DEVICE)

        return X, y, protected

    # -----------------------------------------
    # Local Training
    # -----------------------------------------
    def train(self, global_weights=None, epochs=2, lr=0.01):

        set_seed(42)

        if global_weights is not None:
            self.model.load_state_dict(global_weights)

        X, y, protected = self.load_data()

        # Handle Class Imbalance
        pos_weight_value = (len(y) - y.sum()) / (y.sum() + 1e-6)
        pos_weight = torch.tensor([pos_weight_value]).to(DEVICE)

        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)

        self.model.train()

        for _ in range(epochs):
            optimizer.zero_grad()
            outputs = self.model(X)
            loss = criterion(outputs, y)

            # Backward pass
            loss.backward()

            # ------------------------------
            # Differential Privacy Section
            # ------------------------------
            if DP_ENABLED:
                torch.nn.utils.clip_grad_norm_(
                    self.model.parameters(),
                    CLIP_VALUE
                )

            # Optimizer step
            optimizer.step()

            # Inject Gaussian noise AFTER update
            if DP_ENABLED:
                with torch.no_grad():
                    for param in self.model.parameters():
                        noise = torch.normal(
                            mean=0.0,
                            std=NOISE_SCALE,
                            size=param.data.size()
                        ).to(param.device)
                        param.add_(noise)

        # Evaluate after training
        metrics = self.evaluate(X, y, protected)

        return self.model.state_dict(), metrics

    # -----------------------------------------
    # Evaluation
    # -----------------------------------------
    def evaluate(self, X, y, protected):

        self.model.eval()

        with torch.no_grad():
            logits = self.model(X)
            probs = torch.sigmoid(logits).cpu().numpy()
            preds = (probs > 0.5).astype(int)

        y_true = y.cpu().numpy().flatten()

        # ---- AUC ----
        try:
            auc = roc_auc_score(y_true, probs)
        except:
            auc = 0.5

        # ---- Demographic Parity ----
        senior_mask = protected == 1
        non_senior_mask = protected == 0

        if senior_mask.sum() > 0 and non_senior_mask.sum() > 0:

            # Positive prediction rates
            senior_positive_rate = preds[senior_mask].mean()
            non_senior_positive_rate = preds[non_senior_mask].mean()

            # Directional bias
            dp_gap_direction = senior_positive_rate - non_senior_positive_rate

            # Absolute fairness metric
            demographic_parity = abs(dp_gap_direction)

        else:
            senior_positive_rate = 0.0
            non_senior_positive_rate = 0.0
            dp_gap_direction = 0.0
            demographic_parity = 0.0
        # ---- Equal Opportunity ----
        def true_positive_rate(mask):
            positives = (y_true[mask] == 1)
            if positives.sum() == 0:
                return 0
            return (preds[mask][positives] == 1).mean()

        tpr_senior = true_positive_rate(senior_mask)
        tpr_non_senior = true_positive_rate(non_senior_mask)
        equal_opportunity = abs(tpr_senior - tpr_non_senior)

        return {
            "auc": float(auc),

            "demographic_parity": float(demographic_parity),
            "dp_gap_direction": float(dp_gap_direction),

            "senior_positive_rate": float(senior_positive_rate),
            "non_senior_positive_rate": float(non_senior_positive_rate),

            "equal_opportunity": float(equal_opportunity),
            "samples": len(y_true)
        }