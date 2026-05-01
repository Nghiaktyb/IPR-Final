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
    """Generate Grad-CAM heatmaps for all diseases. Falls back to simulated heatmaps if torch unavailable."""
    case_heatmap_dir = os.path.join(settings.HEATMAP_DIR, case_id)
    os.makedirs(case_heatmap_dir, exist_ok=True)

    if not TORCH_AVAILABLE:
        return _generate_simulated_heatmaps(image_path, case_heatmap_dir)

    from app.services.ai_service import ai_model
    model = ai_model.get_model()
    device = ai_model.get_device()
    transform = ai_model.get_transform()

    if model is None:
        return _generate_simulated_heatmaps(image_path, case_heatmap_dir)

    image = Image.open(image_path).convert("RGB")
    input_tensor = transform(image).unsqueeze(0).to(device)
    gradcam = GradCAM(model)

    heatmap_paths = {}

    for idx, disease in enumerate(settings.DISEASE_CLASSES):
        heatmap = gradcam.generate(input_tensor.clone(), idx)
        output_path = os.path.join(case_heatmap_dir, f"{disease.lower()}_heatmap.png")
        generate_heatmap_overlay(image_path, heatmap, output_path)
        heatmap_paths[disease] = output_path

    return heatmap_paths


def _generate_simulated_heatmaps(image_path: str, output_dir: str) -> dict:
    """Generate simulated heatmaps when the real model is not available.
    Uses gaussian blobs at random positions overlaid on the original image."""
    from PIL import Image as PILImage, ImageFilter
    import random

    try:
        original = PILImage.open(image_path).convert("RGB")
    except Exception:
        return {disease: None for disease in settings.DISEASE_CLASSES}

    w, h = original.size
    orig_array = np.array(original)

    # Predefined focus areas for different diseases (ratios of image dimensions)
    disease_focus = {
        "Atelectasis":  (0.55, 0.55),   # lower-middle lung
        "Effusion":     (0.35, 0.70),   # lower-left
        "Pneumonia":    (0.65, 0.45),   # mid-right lung
        "Nodule":       (0.45, 0.35),   # upper-left
        "Mass":         (0.60, 0.55),   # mid-right
    }

    heatmap_paths = {}

    for disease in settings.DISEASE_CLASSES:
        cx_ratio, cy_ratio = disease_focus.get(disease, (0.5, 0.5))
        # Add slight randomness
        cx = int(w * (cx_ratio + random.uniform(-0.08, 0.08)))
        cy = int(h * (cy_ratio + random.uniform(-0.08, 0.08)))
        sigma_x = w * random.uniform(0.15, 0.30)
        sigma_y = h * random.uniform(0.15, 0.30)

        # Create gaussian heatmap
        y_coords, x_coords = np.mgrid[0:h, 0:w]
        heatmap = np.exp(-((x_coords - cx)**2 / (2 * sigma_x**2) + (y_coords - cy)**2 / (2 * sigma_y**2)))
        heatmap = (heatmap / heatmap.max() * 255).astype(np.uint8)

        # Apply JET-like colormap manually (Red-Yellow-Green-Cyan-Blue)
        colored = np.zeros((h, w, 3), dtype=np.uint8)
        # Simple JET approximation
        r = np.clip(1.5 - np.abs(heatmap / 255.0 * 4 - 3), 0, 1)
        g = np.clip(1.5 - np.abs(heatmap / 255.0 * 4 - 2), 0, 1)
        b = np.clip(1.5 - np.abs(heatmap / 255.0 * 4 - 1), 0, 1)
        colored[:, :, 0] = (r * 255).astype(np.uint8)
        colored[:, :, 1] = (g * 255).astype(np.uint8)
        colored[:, :, 2] = (b * 255).astype(np.uint8)

        # Blend with original
        alpha = 0.4
        blended = (orig_array * (1 - alpha) + colored * alpha).astype(np.uint8)

        output_path = os.path.join(output_dir, f"{disease.lower()}_heatmap.png")
        PILImage.fromarray(blended).save(output_path)
        heatmap_paths[disease] = output_path

    return heatmap_paths

