import { crc32 } from './crc32';

// ── Types (mirror the YAML schema) ───────────────────────────────────────────

export interface RomFile {
  name: string;
  crc32: number;
}

export interface RomRegion {
  base: number;
  /** Byte size of the ROM file(s).
   *  For 16-bit interleave:      address range is [base, base + size*2).
   *  For 16-bit-word-swap:       address range is [base, base + size). */
  size: number;
  /** 16-bit interleave (ROM_LOAD16_BYTE): even-address bytes. */
  high_byte?: RomFile;
  /** 16-bit interleave (ROM_LOAD16_BYTE): odd-address bytes. */
  low_byte?: RomFile;
  /** 16-bit word-swap (ROM_LOAD16_WORD_SWAP): single file, bytes swapped per word. */
  file?: RomFile;
}

export interface RomLayout {
  layout: string;
  regions: RomRegion[];
}

export interface MemoryPatch {
  address: number;
  value: number; // 16-bit word
}

export interface Hack {
  description: string;
  author?: string;
  memory?: MemoryPatch[];
}

export interface BytePatch {
  file: string;
  offset: number;
  value: number; // single byte
}

// ── CRC verification ──────────────────────────────────────────────────────────

/** Throws if any ROM file is missing or has an unexpected CRC. */
export function verifyCRCs(
  regions: RomRegion[],
  files: Record<string, Uint8Array>,
): void {
  for (const region of regions) {
    const romFiles = region.file
      ? [region.file]
      : [region.high_byte!, region.low_byte!];
    for (const romFile of romFiles) {
      const data = files[romFile.name];
      if (!data) throw new Error(`Missing ROM file: ${romFile.name}`);

      const actual = crc32(data);
      if (actual !== romFile.crc32) {
        throw new Error(
          `CRC mismatch on ${romFile.name}: ` +
          `got 0x${actual.toString(16).toUpperCase().padStart(8, '0')}, ` +
          `expected 0x${romFile.crc32.toString(16).toUpperCase().padStart(8, '0')}`,
        );
      }
    }
  }
}

// ── Patch resolution ──────────────────────────────────────────────────────────

/**
 * Converts the selected hacks' memory addresses into concrete byte patches.
 * Supports both 16-bit interleave (ROM_LOAD16_BYTE) and 16-bit-word-swap (ROM_LOAD16_WORD_SWAP).
 */
export function resolveHackPatches(
  roms: RomLayout,
  hacks: Hack[],
  enabledIndices: Set<number>,
): BytePatch[] {
  const is16bit     = roms.layout === '16-bit-interleaved';
  const isWordSwap  = roms.layout === '16-bit-word-swap';
  if (!is16bit && !isWordSwap) {
    throw new Error(`Unsupported ROM layout: ${roms.layout}`);
  }

  const patches: BytePatch[] = [];

  for (const [i, hack] of hacks.entries()) {
    if (!enabledIndices.has(i) || !hack.memory) continue;

    for (const { address, value } of hack.memory) {
      const virtualSize = (r: RomRegion) => is16bit ? r.size * 2 : r.size;
      const region = roms.regions.find(
        r => address >= r.base && address < r.base + virtualSize(r),
      );
      if (!region) {
        throw new Error(
          `Address 0x${address.toString(16).padStart(6, '0')} is not covered by any ROM region`,
        );
      }

      if (is16bit) {
        // Two files: each stores every other byte at offset = (addr - base) / 2
        const offset = (address - region.base) / 2;
        patches.push({ file: region.high_byte!.name, offset, value: (value >> 8) & 0xff });
        patches.push({ file: region.low_byte!.name,  offset, value: value & 0xff });
      } else {
        // Single file, word-swapped: low byte at even offset, high byte at odd offset
        const offset = address - region.base;
        patches.push({ file: region.file!.name, offset: offset,     value: value & 0xff });
        patches.push({ file: region.file!.name, offset: offset + 1, value: (value >> 8) & 0xff });
      }
    }
  }

  return patches;
}

// ── Patch application ─────────────────────────────────────────────────────────

/**
 * Applies byte patches to (copies of) the affected files.
 * Returns a new map; original `files` are not mutated.
 */
export function applyPatches(
  patches: BytePatch[],
  files: Record<string, Uint8Array>,
): Record<string, Uint8Array> {
  const modified = new Set(patches.map(p => p.file));

  // Clone only the files that will be written
  const output: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    output[name] = modified.has(name) ? data.slice() : data;
  }

  for (const { file, offset, value } of patches) {
    if (!output[file]) throw new Error(`Missing file in zip: ${file}`);
    if (offset >= output[file].length) {
      throw new Error(`Offset 0x${offset.toString(16)} out of range for ${file}`);
    }
    output[file][offset] = value;
  }

  return output;
}
