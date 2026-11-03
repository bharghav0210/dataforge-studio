import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Webpack is used for reproducible builds on hosts that restrict Turbopack IPC.
  reactStrictMode: true,
};
export default nextConfig;
