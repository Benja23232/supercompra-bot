import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agregamos la IP de tu red para habilitar el acceso desde el teléfono y la tablet
  allowedDevOrigins: ["192.168.56.1", "192.168.1.117", "localhost"],
};

export default nextConfig;