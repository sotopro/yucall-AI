# yucall on the VPS: Next standalone server. Built by the company Forgejo CI
# (.forgejo/workflows/image.yml); the host signer signs it after its own scan.
ARG NODE_IMAGE=node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The browser's ONNX runtime is served from /ort/ (translation-worker.js), not from a CDN.
RUN mkdir -p public/ort && cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.wasm \
      node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs public/ort/ \
 && npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY vps-start.mjs ./
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "vps-start.mjs"]
