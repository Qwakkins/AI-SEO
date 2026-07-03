import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so builds inside nested git worktrees don't
    // resolve modules through a parent repo's node_modules.
    root: __dirname,
  },
};

export default nextConfig;
