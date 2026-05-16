import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Relative asset paths so scripts/CSS load inside chrome-extension://
  assetPrefix: ".",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
