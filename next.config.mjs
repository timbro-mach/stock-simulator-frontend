/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard', // Or the default page you want to load
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
