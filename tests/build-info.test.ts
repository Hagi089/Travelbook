import { describe, expect, it } from 'vitest';
import { buildInfoText } from '../src/buildInfo';

describe('Versionsangabe', () => {
  it('setzt Version, Build und Zeit zusammen', () => {
    const t = buildInfoText('0.8.0', 'a1b2c3d', '2026-09-30T05:10:00Z');
    expect(t).toMatch(/^Version 0\.8\.0 · Build a1b2c3d · .+/);
  });
  it('lässt eine fehlende oder ungültige Zeit weg', () => {
    expect(buildInfoText('0.8.0', 'abc', '')).toBe('Version 0.8.0 · Build abc');
    expect(buildInfoText('0.8.0', 'abc', 'kaputt')).toBe('Version 0.8.0 · Build abc');
  });
});
