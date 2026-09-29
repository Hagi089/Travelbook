/**
 * Minimaler ZIP-Leser und -Schreiber ohne Abhängigkeiten (Phase 8a).
 *
 * Bewusst klein gehalten:
 * - Schreiben: Methode "stored" (0) oder "deflate" (8, nur wenn `CompressionStream('deflate-raw')` vorhanden ist).
 *   Fotos sind bereits JPEG und werden unkomprimiert abgelegt; große Dateien bleiben als Blob-Teile (kein Kopieren).
 * - Lesen: liest nur das zentrale Verzeichnis und einzelne Einträge per `Blob.slice` – die ZIP-Datei wird nie ganz
 *   in den Arbeitsspeicher geladen. Prüfsumme (CRC-32) und Größe werden bei jedem Lesen kontrolliert.
 * - Nicht unterstützt (mit klarer Fehlermeldung): ZIP64 (> 4 GB oder > 65.535 Einträge), Verschlüsselung,
 *   mehrteilige Archive, andere Kompressionsmethoden.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const MAX_U32 = 0xffffffff;
const MAX_ENTRIES = 0xfffe;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** Bytes als BlobPart (TypeScript-Versionen unterscheiden sich bei Uint8Array<ArrayBufferLike>). */
function part(bytes: Uint8Array): BlobPart {
  return bytes as unknown as BlobPart;
}

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function canCompress(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof Response !== 'undefined';
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([part(bytes)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(blob: Blob): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Dieses Gerät kann komprimierte ZIP-Einträge nicht entpacken.');
  const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface WrittenEntry {
  nameBytes: Uint8Array;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

export interface AddOptions {
  /** Deflate versuchen (nur sinnvoll für Text/JSON). Fällt auf "stored" zurück, wenn es nichts bringt oder nicht verfügbar ist. */
  compress?: boolean;
}

export class ZipWriter {
  private parts: BlobPart[] = [];
  private entries: WrittenEntry[] = [];
  private offset = 0;
  private names = new Set<string>();
  private stamp = dosDateTime(new Date());

  async add(name: string, data: Blob | Uint8Array | string, options: AddOptions = {}): Promise<void> {
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error(`Ungültiger Dateiname im Backup: ${name}`);
    if (this.names.has(name)) throw new Error(`Doppelter Eintrag im Backup: ${name}`);
    if (this.entries.length >= MAX_ENTRIES) throw new Error('Das Backup enthält zu viele Dateien für das ZIP-Format.');

    let bytes: Uint8Array;
    if (typeof data === 'string') bytes = encoder.encode(data);
    else if (data instanceof Uint8Array) bytes = data;
    else bytes = new Uint8Array(await data.arrayBuffer());

    const crc = crc32(bytes);
    let method = 0;
    let body: BlobPart = data instanceof Blob ? data : part(bytes);
    let compressedSize = bytes.length;
    if (options.compress && canCompress() && bytes.length > 256) {
      const packed = await deflateRaw(bytes);
      if (packed.length < bytes.length) {
        method = 8;
        body = part(packed);
        compressedSize = packed.length;
      }
    }
    if (bytes.length > MAX_U32 || compressedSize > MAX_U32 || this.offset > MAX_U32) throw new Error('Das Backup ist für das ZIP-Format zu groß (Grenze 4 GB).');

    const nameBytes = encoder.encode(name);
    const header = new Uint8Array(30);
    const v = new DataView(header.buffer);
    v.setUint32(0, SIG_LOCAL, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, FLAG_UTF8, true);
    v.setUint16(8, method, true);
    v.setUint16(10, this.stamp.time, true);
    v.setUint16(12, this.stamp.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, compressedSize, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true);

    this.entries.push({ nameBytes, method, crc, compressedSize, size: bytes.length, offset: this.offset, time: this.stamp.time, date: this.stamp.date });
    this.names.add(name);
    this.parts.push(part(header), part(nameBytes), body);
    this.offset += 30 + nameBytes.length + compressedSize;
  }

  finish(): Blob {
    const cdStart = this.offset;
    let cdSize = 0;
    for (const e of this.entries) {
      const rec = new Uint8Array(46);
      const v = new DataView(rec.buffer);
      v.setUint32(0, SIG_CENTRAL, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, FLAG_UTF8, true);
      v.setUint16(10, e.method, true);
      v.setUint16(12, e.time, true);
      v.setUint16(14, e.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.compressedSize, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.nameBytes.length, true);
      v.setUint32(42, e.offset, true);
      this.parts.push(part(rec), part(e.nameBytes));
      cdSize += 46 + e.nameBytes.length;
    }
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, SIG_END, true);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, cdSize, true);
    v.setUint32(16, cdStart, true);
    this.parts.push(part(end));
    return new Blob(this.parts, { type: 'application/zip' });
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

async function readBytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

export class ZipReader {
  private constructor(
    private readonly blob: Blob,
    readonly entries: Map<string, ZipEntry>,
  ) {}

  static async open(blob: Blob): Promise<ZipReader> {
    if (blob.size < 22) throw new Error('Die Datei ist kein gültiges ZIP-Archiv (zu klein).');
    const tailStart = Math.max(0, blob.size - (22 + 0xffff));
    const tail = await readBytes(blob, tailStart, blob.size);
    const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tv.getUint32(i, true) === SIG_END) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Die Datei ist kein gültiges ZIP-Archiv (Endkennung fehlt).');
    const disk = tv.getUint16(eocd + 4, true);
    const cdDisk = tv.getUint16(eocd + 6, true);
    const count = tv.getUint16(eocd + 10, true);
    const cdSize = tv.getUint32(eocd + 12, true);
    const cdOffset = tv.getUint32(eocd + 16, true);
    if (disk !== 0 || cdDisk !== 0) throw new Error('Mehrteilige ZIP-Archive werden nicht unterstützt.');
    if (count === 0xffff || cdSize === MAX_U32 || cdOffset === MAX_U32) throw new Error('ZIP64-Archive werden nicht unterstützt.');
    if (cdOffset + cdSize > blob.size) throw new Error('Das ZIP-Archiv ist beschädigt (Verzeichnis außerhalb der Datei).');

    const cd = await readBytes(blob, cdOffset, cdOffset + cdSize);
    const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const entries = new Map<string, ZipEntry>();
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || v.getUint32(p, true) !== SIG_CENTRAL) throw new Error('Das ZIP-Archiv ist beschädigt (Verzeichniseintrag).');
      const flags = v.getUint16(p + 8, true);
      const method = v.getUint16(p + 10, true);
      const crc = v.getUint32(p + 16, true);
      const compressedSize = v.getUint32(p + 20, true);
      const size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const localOffset = v.getUint32(p + 42, true);
      if (p + 46 + nameLen > cd.length) throw new Error('Das ZIP-Archiv ist beschädigt (Dateiname).');
      const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (flags & FLAG_ENCRYPTED) throw new Error('Verschlüsselte ZIP-Archive werden nicht unterstützt.');
      if (method !== 0 && method !== 8) throw new Error(`Nicht unterstützte Kompressionsmethode (${method}) bei ${name}.`);
      if (name.endsWith('/')) continue; // Ordnereinträge
      if (entries.has(name)) throw new Error(`Das ZIP-Archiv enthält den Eintrag ${name} doppelt.`);
      entries.set(name, { name, method, crc, compressedSize, size, localOffset });
    }
    return new ZipReader(blob, entries);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Rohdaten des Eintrags als Blob-Ausschnitt (ohne Kopie), noch nicht entpackt und nicht geprüft. */
  private async raw(entry: ZipEntry): Promise<Blob> {
    const head = await readBytes(this.blob, entry.localOffset, entry.localOffset + 30);
    const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
    if (head.length < 30 || v.getUint32(0, true) !== SIG_LOCAL) throw new Error(`Das ZIP-Archiv ist beschädigt (Kopfzeile von ${entry.name}).`);
    const start = entry.localOffset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
    if (start + entry.compressedSize > this.blob.size) throw new Error(`Das ZIP-Archiv ist beschädigt (${entry.name} ist unvollständig).`);
    return this.blob.slice(start, start + entry.compressedSize);
  }

  /** Entpackte und geprüfte Bytes (CRC-32 und Größe müssen stimmen). */
  async bytes(name: string): Promise<Uint8Array> {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Im Backup fehlt die Datei ${name}.`);
    const raw = await this.raw(entry);
    const out = entry.method === 0 ? new Uint8Array(await raw.arrayBuffer()) : await inflateRaw(raw);
    if (out.length !== entry.size || crc32(out) !== entry.crc) throw new Error(`Die Datei ${name} im Backup ist beschädigt (Prüfsumme stimmt nicht).`);
    return out;
  }

  async text(name: string): Promise<string> {
    return decoder.decode(await this.bytes(name));
  }

  async json<T = unknown>(name: string): Promise<T> {
    const text = await this.text(name);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Die Datei ${name} im Backup ist kein gültiges JSON.`);
    }
  }

  /**
   * Geprüfter Inhalt als Blob. Unkomprimierte Einträge bleiben ein Ausschnitt der Originaldatei (kein Kopieren in den
   * Arbeitsspeicher, die Prüfung liest sie aber einmal durch).
   */
  async entryBlob(name: string, type: string): Promise<Blob> {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Im Backup fehlt die Datei ${name}.`);
    const raw = await this.raw(entry);
    if (entry.method === 0) {
      const bytes = new Uint8Array(await raw.arrayBuffer());
      if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new Error(`Die Datei ${name} im Backup ist beschädigt (Prüfsumme stimmt nicht).`);
      return raw.slice(0, raw.size, type);
    }
    const out = await inflateRaw(raw);
    if (out.length !== entry.size || crc32(out) !== entry.crc) throw new Error(`Die Datei ${name} im Backup ist beschädigt (Prüfsumme stimmt nicht).`);
    return new Blob([part(out)], { type });
  }
}
