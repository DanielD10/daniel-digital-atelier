import { inflateRawSync } from "node:zlib";

/**
 * Just enough ZIP to open a spreadsheet.
 *
 * An .xlsx is a ZIP archive of XML parts, and Node already ships the
 * hard half of that in zlib. A dependency here would pull a general
 * archive library — symlinks, encryption, ZIP64 spanning, the lot —
 * to read four known files out of a container the user just uploaded.
 * This reads the central directory, inflates the entries it is asked
 * for, and refuses everything it does not understand.
 */

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CEN_SIG = 0x02014b50;

/** Archives bigger than this are not spreadsheets anyone should upload. */
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

export class ZipError extends Error {}

interface Entry {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export class ZipArchive {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly buf: Buffer) {
    const eocd = this.findEocd();
    let { count, cenOffset } = eocd;

    // ZIP64: the classic record stores 0xffff/0xffffffff as "look in the
    // 64-bit record". Spreadsheets reach this at around 65k sheets or
    // 4GB, which should not happen, but reading a truncated directory
    // and silently finding no sheets would be a worse failure.
    if (count === 0xffff || cenOffset === 0xffffffff) {
      const z64 = this.findZip64(eocd.eocdOffset);
      if (z64) {
        count = z64.count;
        cenOffset = z64.cenOffset;
      }
    }

    let p = cenOffset;
    for (let i = 0; i < count; i++) {
      if (p + 46 > this.buf.length) throw new ZipError("Central directory runs past the end of the file.");
      if (this.buf.readUInt32LE(p) !== CEN_SIG) throw new ZipError("Corrupt central directory.");

      const compression = this.buf.readUInt16LE(p + 10);
      const compressedSize = this.buf.readUInt32LE(p + 20);
      const uncompressedSize = this.buf.readUInt32LE(p + 24);
      const nameLen = this.buf.readUInt16LE(p + 28);
      const extraLen = this.buf.readUInt16LE(p + 30);
      const commentLen = this.buf.readUInt16LE(p + 32);
      const localHeaderOffset = this.buf.readUInt32LE(p + 42);
      const name = this.buf.toString("utf8", p + 46, p + 46 + nameLen);

      this.entries.set(name, {
        name,
        compression,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  /** Inflate one entry to a string. Returns null if it isn't there. */
  read(name: string): string | null {
    const e = this.entries.get(name);
    if (!e) return null;
    if (e.uncompressedSize > MAX_ENTRY_BYTES) {
      throw new ZipError(`${name} is ${(e.uncompressedSize / 1048576).toFixed(0)}MB, which is past what this will open.`);
    }

    // The local header's name and extra lengths can differ from the
    // central directory's, so the data offset has to be read from the
    // local header rather than assumed.
    const lh = e.localHeaderOffset;
    if (lh + 30 > this.buf.length) throw new ZipError("Entry points past the end of the file.");
    const nameLen = this.buf.readUInt16LE(lh + 26);
    const extraLen = this.buf.readUInt16LE(lh + 28);
    const start = lh + 30 + nameLen + extraLen;
    const end = start + e.compressedSize;
    if (end > this.buf.length) throw new ZipError("Entry data runs past the end of the file.");

    const raw = this.buf.subarray(start, end);
    if (e.compression === 0) return raw.toString("utf8");
    if (e.compression === 8) {
      try {
        return inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8");
      } catch {
        throw new ZipError(`Couldn't decompress ${name}.`);
      }
    }
    throw new ZipError(`${name} uses an unsupported compression method.`);
  }

  /**
   * Scan backwards for the end-of-central-directory record. It sits at
   * the very end unless the archive carries a comment, so the search
   * window is the maximum comment length plus the record itself.
   */
  private findEocd(): { count: number; cenOffset: number; eocdOffset: number } {
    const min = Math.max(0, this.buf.length - (0xffff + 22));
    for (let i = this.buf.length - 22; i >= min; i--) {
      if (this.buf.readUInt32LE(i) === EOCD_SIG) {
        return {
          count: this.buf.readUInt16LE(i + 10),
          cenOffset: this.buf.readUInt32LE(i + 16),
          eocdOffset: i,
        };
      }
    }
    throw new ZipError("Not a ZIP archive — no end-of-directory record.");
  }

  private findZip64(eocdOffset: number): { count: number; cenOffset: number } | null {
    const locator = eocdOffset - 20;
    if (locator < 0 || this.buf.readUInt32LE(locator) !== EOCD64_LOCATOR_SIG) return null;
    const z64 = Number(this.buf.readBigUInt64LE(locator + 8));
    if (z64 < 0 || z64 + 56 > this.buf.length) return null;
    if (this.buf.readUInt32LE(z64) !== EOCD64_SIG) return null;
    return {
      count: Number(this.buf.readBigUInt64LE(z64 + 32)),
      cenOffset: Number(this.buf.readBigUInt64LE(z64 + 48)),
    };
  }
}
