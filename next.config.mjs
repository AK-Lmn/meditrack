/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/reset-password', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] }]
  },
}

export default nextConfig
