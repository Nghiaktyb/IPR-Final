"""
MedicX — Grad-CAM Heatmap Service
Generates Grad-CAM heatmaps for AI explainability.
Gracefully degrades if PyTorch is not available.
"""
import os
import numpy as np
from typing import Optional
from app.config import settings

try:
    import torch
    import torch.nn.functional as F
    import cv2
    from PIL import Image
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


class GradCAM:
    """Grad-CAM for ResNet18 targeting layer4."""
    def __init__(self, model, target_layer=None):
        self.model = model
        self.gradients = None
        self.activations = None
        if target_layer is None:
            self.target_layer = model.layer4[-1]
        else:
            self.target_layer = target_layer
        self.target_layer.register_forward_hook(self._save_activation)
        self.target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, input, output):
        self.activations = output.detach()

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def generate(self, input_tensor, class_idx: int):
        self.model.eval()
        input_tensor.requires_grad_(True)
        output = self.model(input_tensor)
        self.model.zero_grad()
        target = output[0, class_idx]
        target.backward(retain_graph=True)
        pooled_gradients = torch.mean(self.gradients, dim=[0, 2, 3])
        activations = self.activations[0]
        for i in range(activations.shape[0]):
            activations[i] *= pooled_gradients[i]
        heatmap = torch.mean(activations, dim=0).cpu().numpy()
        heatmap = np.maximum(heatmap, 0)
        if heatmap.max() > 0:
            heatmap /= heatmap.max()
        return heatmap


def generate_heatmap_overlay(image_path, heatmap, output_path, alpha=0.4):
    """Overlay heatmap on original image."""
    original = cv2.imread(image_path)
    if original is None:
        pil_img = Image.open(image_path).convert("RGB")
        original = np.array(pil_img)
        original = cv2.cvtColor(original, cv2.COLOR_RGB2BGR)
    h, w = original.shape[:2]
    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_colored = cv2.applyColorMap(np.uint8(255 * heatmap_resized), cv2.COLORMAP_JET)
    overlay = cv2.addWeighted(original, 1 - alpha, heatmap_colored, alpha, 0)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, overlay)
    return output_path


def generate_all_heatmaps(image_path: str, case_id: str, threshold: float = None) -> dict:
    """Generate Grad-CAM heatmaps for all diseases. Returns empty dict if torch unavailable."""
    if not TORCH_AVAILABLE:
        return {disease: None for disease in settings.DISEASE_CLASSES}

    from app.services.ai_service import ai_model
    model = ai_model.get_model()
    device = ai_model.get_device()
    transform = ai_model.get_transform()

    if model is None:
        return {disease: None for disease in settings.DISEASE_CLASSES}

    image = Image.open(image_path).convert("RGB")
    input_tensor = transform(image).unsqueeze(0).to(device)
    gradcam = GradCAM(model)

    heatmap_paths = {}
    case_heatmap_dir = os.path.join(settings.HEATMAP_DIR, case_id)
    os.makedirs(case_heatmap_dir, exist_ok=True)

    for idx, disease in enumerate(settings.DISEASE_CLASSES):
        heatmap = gradcam.generate(input_tensor.clone(), idx)
        output_path = os.path.join(case_heatmap_dir, f"{disease.lower()}_heatmap.png")
        generate_heatmap_overlay(image_path, heatmap, output_path)
        heatmap_paths[disease] = output_path

    return heatmap_paths
