const PLACEHOLDER_VALUES = new Set([
  'generate-a-unique-random-secret-of-at-least-32-bytes',
  'generate-a-unique-random-access-code-of-at-least-32-characters',
]);

const REQUIRED_PRODUCTION_AUTH_VARIABLES = ['AUTH_SECRET'];

/**
 * @param {Record<string, string | undefined>} environment
 * @returns {string[]}
 */
export function getProductionAuthConfigurationErrors(environment) {
  return REQUIRED_PRODUCTION_AUTH_VARIABLES.filter((name) => {
    const value = environment[name]?.trim();
    return (
      value === undefined ||
      value.length < 32 ||
      PLACEHOLDER_VALUES.has(value)
    );
  });
}
