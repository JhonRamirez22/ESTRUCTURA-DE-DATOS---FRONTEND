import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('endurecimiento de Next.js', () => {
  it('no anuncia el framework en las cabeceras de respuesta', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
