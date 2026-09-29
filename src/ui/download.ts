import { h } from './dom';

/** Bietet Text als Datei zum Download an (Browser; unter Android später durch Speichern/Teilen zu ersetzen). */
export function downloadText(fileName: string, text: string, mimeType = 'application/gpx+xml'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
