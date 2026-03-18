import torch
import torch.nn as nn
import pandas as pd
import numpy as np
import random

from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score

from federated.model import LogisticRegressionModel
from federated.config import (
    MODEL_FEATURES, TARGET_COLUMN, PROTECTED_ATTRIBUTE, INPUT_DIM,
    DP_ENABLED, CLIP_VALUE, NOISE_SCALE,
    LOCAL_EPOCHS, LEARNING_RATE,
    FAIRNESS_LOSS_WEIGHT
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


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
    # Load and Preprocess Data
    # Raw data — no demographic balancing.
    # Real-world eICU data is naturally imbalanced.
    # BiasGuard addresses this through fairness
    # regularisation and bias-aware aggregation,
    # not through preprocessing manipulation.
    # -----------------------------------------
    def load_data(self):
        df = pd.read_csv(self.csv_path)

        X         = df[MODEL_FEATURES].values
        y         = df[TARGET_COLUMN].values
        protected = df[PROTECTED_ATTRIBUTE].values

        imputer = SimpleImputer(strategy="median")
        X = imputer.fit_transform(X)

        scaler = StandardScaler()
        X = scaler.fit_transform(X)

        X = torch.tensor(X, dtype=torch.float32).to(DEVICE)
        y = torch.tensor(y, dtype=torch.float32).unsqueeze(1).to(DEVICE)

        return X, y, protected

    # -----------------------------------------
    # Local Training
    #
    # Key feature: ADAPTIVE fairness loss weight.
    # The weight scales with the current network DP gap —
    # strong pressure when bias is high (early rounds),
    # gentle pressure when bias is low (later rounds).
    # This is why BiasGuard converges faster than baseline.
    #
    # Formula: effective_weight = base_weight * (1 + current_dp)
    # At DP=0.686 (round 1): weight = 0.8 * 1.686 = 1.35
    # At DP=0.089 (round 20): weight = 0.8 * 1.089 = 0.87
    # At DP=0.029 (round 40): weight = 0.8 * 1.029 = 0.82
    # -----------------------------------------
    def train(self, global_weights=None, epochs=None, lr=None, current_dp=None):

        set_seed(42)

        if epochs is None:
            epochs = LOCAL_EPOCHS
        if lr is None:
            lr = LEARNING_RATE

        if global_weights is not None:
            self.model.load_state_dict(global_weights)

        X, y, protected = self.load_data()

        # Handle class imbalance in mortality outcome
        pos_weight_value = (len(y) - y.sum()) / (y.sum() + 1e-6)
        pos_weight       = torch.tensor([pos_weight_value]).to(DEVICE)

        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)

        senior_mask     = torch.tensor(protected == 1, dtype=torch.bool).to(DEVICE)
        non_senior_mask = torch.tensor(protected == 0, dtype=torch.bool).to(DEVICE)

        # Adaptive fairness weight — scales with current network DP gap.
        # Higher bias in the network = stronger local fairness pressure.
        # Falls back to base weight if current_dp not provided
        # (e.g. baseline experiment where fairness is disabled).
        if current_dp is not None and FAIRNESS_LOSS_WEIGHT > 0:
            adaptive_weight = FAIRNESS_LOSS_WEIGHT * (1.0 + current_dp)
        else:
            adaptive_weight = FAIRNESS_LOSS_WEIGHT

        self.model.train()

        for _ in range(epochs):
            optimizer.zero_grad()
            outputs = self.model(X)

            loss = criterion(outputs, y)

            # -----------------------------------------
            # Adaptive Fairness Regularisation Loss
            # Penalises demographic parity gap during
            # local training. Weight scales with how
            # biased the current network round is —
            # strongest in early high-bias rounds where
            # it does the most good, tapering naturally
            # as the global model becomes fairer.
            # -----------------------------------------
            if (
                adaptive_weight > 0
                and senior_mask.sum() > 0
                and non_senior_mask.sum() > 0
            ):
                probs                = torch.sigmoid(outputs)
                senior_pred_rate     = probs[senior_mask].mean()
                non_senior_pred_rate = probs[non_senior_mask].mean()
                fairness_penalty     = torch.abs(senior_pred_rate - non_senior_pred_rate)
                loss = loss + adaptive_weight * fairness_penalty

            loss.backward()

            if DP_ENABLED:
                torch.nn.utils.clip_grad_norm_(
                    self.model.parameters(),
                    CLIP_VALUE
                )

            optimizer.step()

            if DP_ENABLED:
                with torch.no_grad():
                    for param in self.model.parameters():
                        noise = torch.normal(
                            mean=0.0,
                            std=NOISE_SCALE,
                            size=param.data.size()
                        ).to(param.device)
                        param.add_(noise)

        metrics = self.evaluate(X, y, protected)
        return self.model.state_dict(), metrics

    # -----------------------------------------
    # Evaluation
    # -----------------------------------------
    def evaluate(self, X, y, protected):

        self.model.eval()

        with torch.no_grad():
            logits = self.model(X)
            probs  = torch.sigmoid(logits).cpu().numpy()
            preds  = (probs > 0.5).astype(int)

        y_true = y.cpu().numpy().flatten()

        try:
            auc = roc_auc_score(y_true, probs)
        except:
            auc = 0.5

        senior_mask     = protected == 1
        non_senior_mask = protected == 0

        if senior_mask.sum() > 0 and non_senior_mask.sum() > 0:
            senior_positive_rate     = preds[senior_mask].mean()
            non_senior_positive_rate = preds[non_senior_mask].mean()
            dp_gap_direction         = senior_positive_rate - non_senior_positive_rate
            demographic_parity       = abs(dp_gap_direction)
        else:
            senior_positive_rate     = 0.0
            non_senior_positive_rate = 0.0
            dp_gap_direction         = 0.0
            demographic_parity       = 0.0

        def true_positive_rate(mask):
            positives = (y_true[mask] == 1)
            if positives.sum() == 0:
                return 0
            return (preds[mask][positives] == 1).mean()

        tpr_senior      = true_positive_rate(senior_mask)
        tpr_non_senior  = true_positive_rate(non_senior_mask)
        equal_opportunity = abs(tpr_senior - tpr_non_senior)

        return {
            "auc":                    float(auc),
            "demographic_parity":     float(demographic_parity),
            "dp_gap_direction":       float(dp_gap_direction),
            "senior_positive_rate":   float(senior_positive_rate),
            "non_senior_positive_rate": float(non_senior_positive_rate),
            "equal_opportunity":      float(equal_opportunity),
            "samples":                len(y_true)
        }