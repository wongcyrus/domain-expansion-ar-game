// Bind PIXI globally for the Live2D adapter
window.PIXI = PIXI;

let live2dModelInstance = null;
let live2dIsSpeaking = false;
let live2dSmoothedVolume = 0;

// Initialize WebGL Application for Live2D Rendering on the Battle page
async function initLive2DCommentator() {
    const canvas = document.getElementById("live2d-commentator-canvas");
    if (!canvas) {
        console.warn("⚠️ Live2D Canvas element not found on page.");
        return;
    }
    
    try {
        const app = new PIXI.Application({
            view: canvas,
            transparent: true,
            backgroundAlpha: 0,
            autoStart: true,
            antialias: true,
            width: 400,
            height: 500,
        });

        console.log("🎬 Loading Shizuku Live2D Model for AI Commentator...");
        const modelUrl = "https://cdn.jsdelivr.net/npm/live2d-widget-model-shizuku@latest/assets/shizuku.model.json";
        const model = await PIXI.live2d.Live2DModel.from(modelUrl);
        app.stage.addChild(model);
        live2dModelInstance = model;

        // Perfect sizing bounds for a 400x500 resolution canvas:
        // - scaleMultiplier = 0.95 scales her up to fit the canvas height nicely.
        // - offsetY = 85 pushes the model anchor down, ensuring her head has plenty of vertical headroom (no top cropping)
        fitModelToCanvas(model, 400, 500, 0.95, 85);

        // Custom update loop for organic Lip-Sync mouth movement
        const originalUpdate = model.internalModel.update;
        model.internalModel.update = function() {
            originalUpdate.apply(this, arguments);
            
            let targetMouthOpen = 0;
            if (live2dIsSpeaking) {
                // Natural speaking mouth movements using randomized organic sine-wave math
                targetMouthOpen = Math.min((Math.sin(Date.now() * 0.015) * 0.45 + 0.45) + (Math.random() * 0.2), 1.0);
            }
            
            live2dSmoothedVolume += (targetMouthOpen - live2dSmoothedVolume) * 0.35;
            applyMouthValue(model, live2dSmoothedVolume);
        };

        console.log("🟢 Shizuku Live2D Co-Host loaded successfully!");

        // Mouse gaze focus tracking
        window.addEventListener("mousemove", (event) => {
            if (model && typeof model.focus === "function") {
                // Focus expects client coordinates
                model.focus(event.clientX, event.clientY);
            }
        });

        // Setup dynamic Avatar Size adjustment slider
        const sizeSlider = document.getElementById("cfg-avatar-size");
        const sizeValLabel = document.getElementById("val-avatar-size");
        const container = document.getElementById("live2d-avatar-container");
        
        if (sizeSlider && container) {
            const savedSize = localStorage.getItem("cfg-avatar-size") || "350";
            sizeSlider.value = savedSize;
            if (sizeValLabel) sizeValLabel.textContent = savedSize + "px";
            container.style.width = savedSize + "px";
            container.style.height = savedSize + "px";

            sizeSlider.addEventListener("input", (e) => {
                const val = e.target.value;
                container.style.width = val + "px";
                container.style.height = val + "px";
                if (sizeValLabel) sizeValLabel.textContent = val + "px";
                localStorage.setItem("cfg-avatar-size", val);
            });
        }

    } catch (err) {
        console.error("⚠️ Shizuku Live2D load failed:", err);
    }
}

function fitModelToCanvas(model, canvasWidth, canvasHeight, scaleMultiplier, offsetY) {
    const bounds = typeof model.getLocalBounds === "function" ? model.getLocalBounds() : { x: 0, y: 0, width: model.width, height: model.height };
    const safeWidth = Math.max(bounds.width || 0, 1);
    const safeHeight = Math.max(bounds.height || 0, 1);
    const scale = Math.min(canvasWidth / safeWidth, canvasHeight / safeHeight) * scaleMultiplier;

    model.scale.set(scale);
    if (model.anchor && typeof model.anchor.set === "function") {
        model.anchor.set(0.5, 1);
        model.x = canvasWidth / 2;
        model.y = canvasHeight + offsetY;
        return;
    }
    model.x = canvasWidth / 2 - (bounds.x + bounds.width / 2) * scale;
    model.y = canvasHeight - (bounds.y + bounds.height) * scale + offsetY;
}

const MOUTH_PARAMETER_IDS = ["ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y", "ParamMouthOpen", "PARAM_MOUTH_OPEN", "ParamA"];

function applyMouthValue(model, value) {
    const core = model?.internalModel?.coreModel || model?.internalModel?.live2DModel;
    if (!core) return;
    
    for (const parameterId of MOUTH_PARAMETER_IDS) {
        try {
            if (typeof core.setParameterValueById === "function") {
                core.setParameterValueById(parameterId, value);
            } else if (typeof core.setParameterValue === "function") {
                core.setParameterValue(parameterId, value);
            } else if (typeof core.setParamFloat === "function") {
                core.setParamFloat(parameterId, value);
            }
        } catch (_) {}
    }
}

// Controller functions to activate and deactivate speaking states and visuals
function startLive2DSpeaking() {
    live2dIsSpeaking = true;
    const container = document.getElementById("live2d-avatar-container");
    if (container) {
        container.classList.add("speaking");
    }
}

function stopLive2DSpeaking() {
    live2dIsSpeaking = false;
    const container = document.getElementById("live2d-avatar-container");
    if (container) {
        container.classList.remove("speaking");
    }
}

// Initialize when the DOM is ready
window.addEventListener("DOMContentLoaded", initLive2DCommentator);

// Apply saved avatar size immediately on script load to prevent visual pop/flicker
(function() {
    try {
        const savedSize = localStorage.getItem("cfg-avatar-size");
        if (savedSize) {
            const container = document.getElementById("live2d-avatar-container");
            if (container) {
                container.style.width = savedSize + "px";
                container.style.height = savedSize + "px";
            }
        }
    } catch (e) {
        console.warn("Could not apply immediate avatar size:", e);
    }
})();
