/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shared modules use .js imports so the emitted standalone server runs in Node.
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }
    return config
  },
  async rewrites() {
    return [
      { source: '/mcp/alexa', destination: '/api/mcp-alexa' },
      {
        source: '/mcp',
        destination: '/api/mcp',
      },
    ]
  },
}

export default nextConfig