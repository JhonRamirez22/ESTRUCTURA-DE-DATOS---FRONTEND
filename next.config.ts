import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = projectRoot;
const configRequire = createRequire(`${projectRoot}/next.config.ts`);
const { getProductionBackendConfigurationErrors } = configRequire(
  `${projectRoot}/src/lib/auth/productionConfiguration.js`
);
const isVercelBuild = process.env.VERCEL === '1';
const isAwsContainerBuild = process.env.AWS_DEPLOYMENT === '1';
const pythonApiUrl = isAwsContainerBuild
  ? null
  : process.env.PYTHON_API_URL?.trim() || (isVercelBuild ? null : 'http://127.0.0.1:8000');
const isVercelProductionBuild = isVercelBuild && process.env.VERCEL_ENV === 'production';

if (pythonApiUrl !== null) {
  const backendUrl = new URL(pythonApiUrl);
  if (
    !['http:', 'https:'].includes(backendUrl.protocol) ||
    backendUrl.pathname !== '/' ||
    backendUrl.search !== '' ||
    backendUrl.hash !== '' || backendUrl.username !== '' || backendUrl.password !== ''
  ) {
    throw new Error('PYTHON_API_URL debe ser el origen HTTP(S) del backend, sin ruta.');
  }
}

if (isVercelProductionBuild) {
  const missingBackendConfiguration = getProductionBackendConfigurationErrors(process.env);
  if (missingBackendConfiguration.length > 0) {
    throw new Error(
      `Configura el origen HTTPS del backend: ${missingBackendConfiguration.join(', ')}.`
    );
  }
}

const nextConfig: NextConfig = {
  // No anunciar el framework en cada respuesta.
  poweredByHeader: false,
  // ECS sirve la interfaz en un contenedor Node; el ALB reenvía /api/* a FastAPI.
  output: 'standalone',
  // Permite validar un build aislado sin borrar los artefactos del `next dev` abierto.
  distDir: process.env.NEXT_BUILD_CHECK_DIR?.trim() || '.next',
  // Este repositorio contiene únicamente el frontend y sus dependencias.
  outputFileTracingRoot: repositoryRoot,
  // Next.js debe recibir los secretos desde el entorno de Vercel, nunca desde archivos locales.
  outputFileTracingExcludes: {
    '/*': ['./.env', './.env.*', './.vercel/.env.*'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
