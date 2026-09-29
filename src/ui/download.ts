import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { h } from './dom';

/**
 * Bietet Text als Datei an.
 * - Android (Capacitor): Datei in den App-Cache schreiben und über das Android-Teilen-Menü anbieten
 *   (dort „Speichern unter“/Drive/Nachrichten usw.). Ein <a download> funktioniert in der WebView nicht zuverlässig.
 * - Browser: normaler Download.
 * Bricht der Nutzer das Teilen ab, ist das kein Fehler.
 */
export async function downloadText(fileName: string, text: string, mimeType = 'application/gpx+xml'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: fileName, dialogTitle: 'GPX-Datei speichern oder teilen', url: uri });
    } catch (e) {
      if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
