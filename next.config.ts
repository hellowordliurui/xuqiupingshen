import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭 DevTools 的 Segment Explorer，避免与损坏的 .next 缓存叠加时出现
  // "Could not find the module … segment-explorer-node … in the React Client Manifest"
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
