import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // Allow the Z.ai preview-chat subdomain to load /_next/* resources.
  // Without this, Next.js 16 emits a cross-origin warning during local dev
  // for any asset requested from the live preview hostname.
  allowedDevOrigins: ["*.space-z.ai"],
};

export default nextConfig;
