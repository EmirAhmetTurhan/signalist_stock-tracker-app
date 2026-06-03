import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  // esbuild is loaded dynamically by worker-pool.ts for runtime bundling
  // of worker_threads TypeScript → JavaScript. Externalize it so Turbopack
  // doesn't try to bundle native binaries (@esbuild/win32-x64/esbuild.exe).
  serverExternalPackages: ['esbuild'],
};

export default nextConfig;
