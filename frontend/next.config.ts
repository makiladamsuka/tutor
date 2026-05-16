import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Allow connections from your local network (fixes the blocked cross-origin warning)
  allowedDevOrigins: ['192.168.56.1'],
};

export default nextConfig;
