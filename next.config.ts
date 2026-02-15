import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/budget-dashboard",
  images: { unoptimized: true },
};

export default nextConfig;
