import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The VPS image runs the standalone server (Dockerfile, vps-start.mjs).
  output: "standalone",
  serverExternalPackages: ["@huggingface/transformers"],
  turbopack: {},
};

export default nextConfig;
