/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep current runtime behavior while frontend preview remains lightweight.
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
