// Web Worker for Transformers.js translation
// Runs in isolated memory space to prevent mobile browser tab crashes

let pipelines = {};

self.onmessage = async (event) => {
  const { type, id, data } = event.data;

  switch (type) {
    case "load": {
      try {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.allowLocalModels = false;
        // Use HuggingFace mirror for users in China (huggingface.co is blocked)
        env.remoteHost = "https://hf-mirror.com";
        // Force WASM backend to avoid WebGPU/WebNN quantization issues
        env.backends.onnx.wasm.proxy = false;

        const { model, label } = data;

        self.postMessage({
          type: "status",
          id,
          data: { status: `Preparing ${label}...` },
        });

        const translator = await pipeline("translation", model, {
          device: "wasm",
          dtype: "fp32",
          progress_callback: (progress) => {
            if (progress.status === "progress" && progress.progress != null) {
              const pct = Math.round(progress.progress);
              self.postMessage({
                type: "status",
                id,
                data: { status: `Downloading ${label}: ${pct}%` },
              });
            } else if (progress.status === "done") {
              self.postMessage({
                type: "status",
                id,
                data: { status: `${label} loaded` },
              });
            } else if (progress.status === "initiate") {
              self.postMessage({
                type: "status",
                id,
                data: { status: `Preparing ${label}...` },
              });
            }
          },
        });

        pipelines[data.pipelineId] = translator;

        self.postMessage({ type: "loaded", id, data: { pipelineId: data.pipelineId } });
      } catch (e) {
        self.postMessage({
          type: "error",
          id,
          data: { error: e.message || "Failed to load model" },
        });
      }
      break;
    }

    case "translate": {
      try {
        const { pipelineId, text } = data;
        const translator = pipelines[pipelineId];
        if (!translator) {
          throw new Error("Pipeline not loaded");
        }
        const result = await translator(text);
        const translated = result[0]?.translation_text || text;
        self.postMessage({ type: "translated", id, data: { translated } });
      } catch (e) {
        self.postMessage({
          type: "error",
          id,
          data: { error: e.message || "Translation failed" },
        });
      }
      break;
    }
  }
};
