import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ovozai/ui", "@ovozai/contracts"],
};

export default nextConfig;
