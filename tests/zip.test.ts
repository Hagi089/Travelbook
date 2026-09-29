import { describe, expect, it } from 'vitest';
import { ZipReader, ZipWriter, crc32 } from '../src/backup/zip';

describe('ZIP-Modul', () => {
  it('berechnet den Standard-CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('schreibt und liest Text (komprimiert), Bytes und Umlaute in Dateinamen', async () => {
    const big = JSON.stringify(Array.from({ length: 5000 }, (_, i) => ({ lat: 48 + i / 1e5, lon: 11, ele: i })));
    const w = new ZipWriter();
    await w.add('data/a.json', big, { compress: true });
    await w.add('photos/x.jpg', new Blob([new Uint8Array([1, 2, 3, 250, 251])], { type: 'image/jpeg' }));
    await w.add('ümlaut/ä.txt', 'Grüße');
    await w.add('leer.json', '[]');
    const r = await ZipReader.open(w.finish());
    expect([...r.entries.keys()].sort()).toEqual(['data/a.json', 'leer.json', 'photos/x.jpg', 'ümlaut/ä.txt']);
    expect(await r.text('data/a.json')).toBe(big);
    expect(await r.text('ümlaut/ä.txt')).toBe('Grüße');
    expect(await r.text('leer.json')).toBe('[]');
    const photo = await r.entryBlob('photos/x.jpg', 'image/jpeg');
    expect(photo.type).toBe('image/jpeg');
    expect([...new Uint8Array(await photo.arrayBuffer())]).toEqual([1, 2, 3, 250, 251]);
  });

  it('erkennt beschädigte Einträge über die Prüfsumme', async () => {
    const w = new ZipWriter();
    await w.add('photos/x.jpg', new Uint8Array([1, 2, 3, 250, 251]));
    const bytes = new Uint8Array(await w.finish().arrayBuffer());
    for (let i = 0; i < bytes.length - 4; i++) {
      if (bytes[i] === 1 && bytes[i + 1] === 2 && bytes[i + 2] === 3 && bytes[i + 3] === 250) {
        bytes[i + 3] ^= 0xff;
        break;
      }
    }
    const r = await ZipReader.open(new Blob([bytes]));
    await expect(r.entryBlob('photos/x.jpg', 'image/jpeg')).rejects.toThrow('beschädigt');
    await expect(r.bytes('photos/x.jpg')).rejects.toThrow('beschädigt');
  });

  it('lehnt Nicht-ZIP-Dateien, fehlende Einträge und unsichere Namen ab', async () => {
    await expect(ZipReader.open(new Blob([new Uint8Array(100)]))).rejects.toThrow('kein gültiges ZIP');
    await expect(ZipReader.open(new Blob(['zu klein']))).rejects.toThrow('zu klein');
    const w = new ZipWriter();
    await w.add('a.txt', 'x');
    const r = await ZipReader.open(w.finish());
    await expect(r.text('fehlt.txt')).rejects.toThrow('fehlt');
    await expect(new ZipWriter().add('../x', 'a')).rejects.toThrow('Ungültiger');
    await expect(new ZipWriter().add('/x', 'a')).rejects.toThrow('Ungültiger');
    const dup = new ZipWriter();
    await dup.add('a.txt', 'x');
    await expect(dup.add('a.txt', 'y')).rejects.toThrow('Doppelter');
  });
});
