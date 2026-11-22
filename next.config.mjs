/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/reset-password', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] }]
  },
}

export default nextConfig
