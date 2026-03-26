import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: '/pictures/**' }],
  },
};

export default nextConfig;
