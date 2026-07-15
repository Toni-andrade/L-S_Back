import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ls/domain", "@ls/addepar", "@ls/docgen"],
  // pptxgenjs must NOT be bundled by Next: its internal dynamic requires break
  // in Vercel's serverless runtime. Load it as a normal Node module instead.
  serverExternalPackages: ["pptxgenjs"],
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
};

export default nextConfig;
