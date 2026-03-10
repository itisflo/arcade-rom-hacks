import { unzipSync, zipSync } from 'fflate';

export type ZipFiles = Record<string, Uint8Array>;

export function readZip(data: ArrayBuffer): ZipFiles {
  const raw = unzipSync(new Uint8Array(data));
  // Filter out directory entries (end with '/')
  return Object.fromEntries(
    Object.entries(raw).filter(([name]) => !name.endsWith('/'))
  );
}

export function writeZip(files: ZipFiles): Uint8Array {
  return zipSync(files, { level: 6 });
}
