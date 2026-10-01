/**
 * @param {Record<string, string | undefined>} environment
 * @returns {string[]}
 */
export function getProductionBackendConfigurationErrors(environment) {
  try {
    const url = new URL(environment.PYTHON_API_URL?.trim() || '');
    if (
      url.protocol === 'https:' && url.pathname === '/' &&
      !url.search && !url.hash && !url.username && !url.password
    ) return [];
  } catch {
    return ['PYTHON_API_URL'];
  }
  return ['PYTHON_API_URL'];
}
