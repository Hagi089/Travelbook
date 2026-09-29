/** Erkennt, ob die App in der nativen Capacitor-Hülle läuft (Details: docs/ARCHITECTURE.md, ADR-001). */
export function isNativeAndroid(): boolean {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === "android";
}
