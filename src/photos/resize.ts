/** Längste Kante gespeicherter Fotos in Pixeln (Speicherverbrauch, ADR/ARCHITECTURE Risiko 4). */
export const MAX_PHOTO_EDGE_PX = 1600;
export const PHOTO_JPEG_QUALITY = 0.8;

/** Skaliert Maße proportional so, dass die längste Kante höchstens `maxEdge` beträgt; vergrößert nie. */
export function fitWithin(width: number, height: number, maxEdge = MAX_PHOTO_EDGE_PX): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error('Ungültige Bildmaße.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface PreparedPhoto {
  data: Blob;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Bereitet ein vom Nutzer gewähltes Bild zum Speichern vor: EXIF-Ausrichtung wird angewendet, auf höchstens
 * 1600 px verkleinert und als JPEG neu kodiert. Dabei entfallen alle EXIF-Metadaten (u. a. GPS-Position der Aufnahme).
 * Nur im Browser/WebView lauffähig (Canvas), nicht in den Vitest-Tests.
 */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Das Bild konnte nicht gelesen werden (Format nicht unterstützt?).');
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Bildverarbeitung nicht verfügbar.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const data = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY));
    if (!data) throw new Error('Das Bild konnte nicht komprimiert werden.');
    return { data, mimeType: 'image/jpeg', width, height };
  } finally {
    bitmap.close();
  }
}
