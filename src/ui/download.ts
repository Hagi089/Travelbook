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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

/**
 * Bietet eine Binärdatei (z. B. das Backup-ZIP) als Datei an. Wie `downloadText`, aber unter Android in Stücken von 3 MB
 * (Vielfaches von 3, damit Base64 ohne Füllzeichen in der Mitte entsteht), damit große Backups nicht als ein einziger
 * Text im Arbeitsspeicher landen. Ältere Backup-Dateien im App-Cache werden vorher entfernt.
 */
export async function downloadBlob(fileName: string, blob: Blob, mimeType = 'application/zip', dialogTitle = 'Backup speichern oder teilen'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache });
      for (const f of files) {
        if (/^travelbook-backup-.*\.zip$/.test(f.name) && f.name !== fileName) await Filesystem.deleteFile({ path: f.name, directory: Directory.Cache });
      }
    } catch {
      /* Aufräumen ist optional */
    }
    const CHUNK = 3 * 1024 * 1024;
    let uri = '';
    for (let offset = 0; offset === 0 || offset < blob.size; offset += CHUNK) {
      const data = await blobToBase64(blob.slice(offset, offset + CHUNK));
      if (offset === 0) uri = (await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache })).uri;
      else await Filesystem.appendFile({ path: fileName, data, directory: Directory.Cache });
    }
    try {
      await Share.share({ title: fileName, dialogTitle, url: uri });
    } catch (e) {
      if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob.type === mimeType ? blob : new Blob([blob], { type: mimeType }));
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
