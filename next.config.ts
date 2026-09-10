import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 产出 .next/standalone：运行镜像只需 Node + 最小依赖树，
   * 不必把整个 node_modules 拷进生产镜像（Dockerfile 的 runner 阶段依赖此输出）。
   */
  output: "standalone",
};

export default nextConfig;
