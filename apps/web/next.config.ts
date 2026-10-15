import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.SDM_BUILD_DIR || (process.env.NODE_ENV === "development" && process.platform === "linux" ? ".next-docker" : ".next"),
  // Prevent the embedded Next.js diagnostics portal from intercepting
  // application clicks during local development.
  devIndicators: false,
  webpack(config, { isServer, dev }) {
    // Windows bind mounts do not reliably forward file events into Docker.
    if (dev && process.platform === "linux") {
      config.watchOptions = { ...config.watchOptions, poll: 1000, aggregateTimeout: 300 };
    }
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    }
    return config;
  },
};

export default nextConfig;
