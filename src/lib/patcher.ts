import { crc32 } from './crc32';

// ── Types (mirror the YAML schema) ───────────────────────────────────────────

export interface RomFile {
  name: string;
  crc32: number;
}

export interface RomRegion {
  base: number;
  /** Byte size of each individual ROM file.
   *  For 16-bit interleave the address range covered is [base, base + size*2). */
  size: number;
  high_byte: RomFile;
  low_byte: RomFile;
}

export interface RomLayout {
  interleave: string;
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
    for (const romFile of [region.high_byte, region.low_byte]) {
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
 * Only supports 16-bit interleaved regions (high_byte / low_byte).
 */
export function resolveHackPatches(
  roms: RomLayout,
  hacks: Hack[],
  enabledIndices: Set<number>,
): BytePatch[] {
  if (roms.interleave !== '16-bit') {
    throw new Error(`Unsupported ROM interleave: ${roms.interleave}`);
  }

  const patches: BytePatch[] = [];

  for (const [i, hack] of hacks.entries()) {
    if (!enabledIndices.has(i) || !hack.memory) continue;

    for (const { address, value } of hack.memory) {
      const region = roms.regions.find(
        r => address >= r.base && address < r.base + r.size * 2,
      );
      if (!region) {
        throw new Error(
          `Address 0x${address.toString(16).padStart(6, '0')} is not covered by any ROM region`,
        );
      }

      // 16-bit interleave: word at address A is split across two files at offset A/2
      const offset = (address - region.base) / 2;
      patches.push({ file: region.high_byte.name, offset, value: (value >> 8) & 0xff });
      patches.push({ file: region.low_byte.name, offset, value: value & 0xff });
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
