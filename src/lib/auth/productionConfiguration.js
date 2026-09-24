/**
 * @param {Record<string, string | undefined>} environment
 * @returns {string[]}
 */
export function getProductionBackendConfigurationErrors(environment) {
  try {
    const url = new URL(environment.PYTHON_API_URL?.trim() || '');
    if (
