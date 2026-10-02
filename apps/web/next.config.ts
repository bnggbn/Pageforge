import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@pageforge/domain'],
  // Static export enables Electron to load via file://
  output: 'export',
  trailingSlash: true,
  // Disable image optimization for Electron compatibility
  images: {
    unoptimized: true,
  },
}

export default nextConfig
