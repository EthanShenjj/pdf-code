import type { NextConfig } from "next";
const nextConfig: NextConfig = { serverExternalPackages: ["@prisma/client"], turbopack: { root: process.cwd() }, agentRules: false };
export default nextConfig;
