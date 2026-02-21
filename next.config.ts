import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/budget-dashboard",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
