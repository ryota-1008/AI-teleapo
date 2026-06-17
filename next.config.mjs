/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma/twilio/xlsx はサーバー専用パッケージ。バンドルせず外部解決させる。
  serverExternalPackages: ['@prisma/client', 'twilio', 'xlsx'],
};

export default nextConfig;
