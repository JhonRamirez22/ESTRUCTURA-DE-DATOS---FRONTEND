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
