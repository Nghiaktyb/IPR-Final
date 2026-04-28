"""
MedicX — AI Inference Service
Loads the pre-trained ResNet18 + Improved Head model and runs multi-label
classification on chest X-ray images.

Gracefully degrades to simulation mode if PyTorch is not installed.
"""
import os
import random
from typing import Optional
from app.config import settings

# Conditional PyTorch import
try:
    import torch
    import torch.nn as nn
    from torchvision import models, transforms
    from PIL import Image
    import numpy as np
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("[WARN] PyTorch not installed. AI inference will run in simulation mode.")


if TORCH_AVAILABLE:
    class ImprovedHead(nn.Module):
        """Custom classification head matching the trained model architecture."""
        def __init__(self, in_features: int, num_classes: int):
            super().__init__()
            self.head = nn.Sequential(
                nn.Linear(in_features, 512),
                nn.BatchNorm1d(512),
                nn.ReLU(inplace=True),
                nn.Dropout(0.3),
                nn.Linear(512, 256),
                nn.BatchNorm1d(256),
                nn.ReLU(inplace=True),
                nn.Dropout(0.2),
                nn.Linear(256, num_classes),
            )

        def forward(self, x):
            return self.head(x)


class MediXModel:
    """Singleton wrapper for the PyTorch model."""
    _instance: Optional["MediXModel"] = None
    _model = None
    _device = None
    _transform = None
    _loaded = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._loaded:
            self._loaded = True
            self._load_model()

    def _load_model(self):
        if not TORCH_AVAILABLE:
            print("[AI] MediX running in simulation mode (no PyTorch)")
            return

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[AI] Loading MediX model on {self._device}...")

        model = models.resnet18(weights=None)
        in_features = model.fc.in_features
        model.fc = ImprovedHead(in_features, len(settings.DISEASE_CLASSES))

        model_path = settings.MODEL_PATH
        if not os.path.exists(model_path):
            print(f"[WARN] Model file not found at {model_path}")
            print("   AI inference will be simulated.")
            self._setup_transform()
            return

        checkpoint = torch.load(model_path, map_location=self._device, weights_only=False)
        if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            model.load_state_dict(checkpoint["model_state_dict"])
        else:
            model.load_state_dict(checkpoint)

        model.to(self._device)
        model.eval()
        self._model = model
        self._setup_transform()
        print(f"[OK] MediX model loaded ({sum(p.numel() for p in model.parameters()):,} params)")

    def _setup_transform(self):
        if not TORCH_AVAILABLE:
            return
        self._transform = transforms.Compose([
            transforms.Resize((settings.IMAGE_SIZE, settings.IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

    def preprocess_image(self, image_path: str):
        if not TORCH_AVAILABLE:
            return None
        image = Image.open(image_path).convert("RGB")
        tensor = self._transform(image).unsqueeze(0)
        return tensor.to(self._device)

    def predict(self, image_path: str, threshold: float = None) -> dict:
        if threshold is None:
            threshold = settings.DEFAULT_THRESHOLD

        if not TORCH_AVAILABLE or self._model is None:
            return self._simulate_prediction(threshold)

        input_tensor = self.preprocess_image(image_path)
        with torch.no_grad():
            logits = self._model(input_tensor)
            probabilities = torch.sigmoid(logits).cpu().numpy()[0]

        results = {}
        flagged = []
        for i, disease in enumerate(settings.DISEASE_CLASSES):
            confidence = float(probabilities[i])
            is_flagged = confidence >= threshold
            results[disease] = {"confidence": round(confidence, 4), "is_flagged": is_flagged}
            if is_flagged:
                flagged.append(disease)

        return {"predictions": results, "flagged_conditions": flagged, "threshold": threshold}

    def _simulate_prediction(self, threshold: float) -> dict:
        results = {}
        flagged = []
        for disease in settings.DISEASE_CLASSES:
            confidence = round(random.uniform(0.15, 0.85), 4)
            is_flagged = confidence >= threshold
            results[disease] = {"confidence": confidence, "is_flagged": is_flagged}
            if is_flagged:
                flagged.append(disease)
        return {"predictions": results, "flagged_conditions": flagged, "threshold": threshold, "simulated": True}

    def get_model(self):
        return self._model

    def get_device(self):
        return self._device

    def get_transform(self):
        return self._transform


ai_model = MediXModel()
