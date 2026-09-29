import { describe, expect, it } from 'vitest';
import { parseThemePref, resolveScheme, toggledPref } from '../src/ui/theme';

describe('Theme-Logik', () => {
  it('erkennt gespeicherte Werte und fällt bei allem anderen auf "system" zurück', () => {
    expect(parseThemePref('light')).toBe('light');
    expect(parseThemePref('dark')).toBe('dark');
    expect(parseThemePref('system')).toBe('system');
    expect(parseThemePref(null)).toBe('system');
    expect(parseThemePref('blau')).toBe('system');
    expect(parseThemePref(undefined)).toBe('system');
  });

  it('löst das tatsächliche Farbschema auf', () => {
    expect(resolveScheme('system', true)).toBe('dark');
    expect(resolveScheme('system', false)).toBe('light');
    expect(resolveScheme('light', true)).toBe('light');
    expect(resolveScheme('dark', false)).toBe('dark');
  });

  it('der Schalter in der App-Leiste wechselt immer zum sichtbaren Gegenteil', () => {
    expect(toggledPref('dark')).toBe('light');
    expect(toggledPref('light')).toBe('dark');
  });
});
