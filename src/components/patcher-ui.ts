/**
 * Lazy-loaded patcher UI logic.
 *
 * Dynamically imported only after the user drops a file, keeping the initial
 * page bundle free of zip / crc / patch dependencies.
 *
 * All DOM queries are scoped to `root` (.rom-patcher element), so multiple
 * instances on the same page work independently.
 */

import { readZip, writeZip } from '../lib/zip';
import { verifyCRCs, resolveHackPatches, applyPatches } from '../lib/patcher';
import type { RomLayout, Hack } from '../lib/patcher';

interface GameData {
  roms: RomLayout;
  hacks: Hack[];
}

// ── Scoped DOM helpers ────────────────────────────────────────────────────────

function q<T extends HTMLElement>(root: HTMLElement, sel: string): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`RomPatcher: missing element "${sel}"`);
  return node;
}

function setStatus(root: HTMLElement, message: string, type?: 'ok' | 'error'): void {
  const el = q(root, '.status');
  el.textContent = message;
  el.hidden = !message;
  if (type) el.dataset.type = type;
  else delete el.dataset.type;
}

// Track per-root AbortControllers to remove stale listeners on re-drop
const patchAbort = new WeakMap<HTMLElement, AbortController>();

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Called by the component bootstrap when a file is dropped or selected.
 * Safe to call multiple times (e.g. user drops a second file).
 */
export async function init(file: File, root: HTMLElement): Promise<void> {
  const gameData: GameData = JSON.parse(root.dataset.game ?? 'null');
  if (!gameData?.roms) throw new Error('RomPatcher: missing game data');

  const dropZone = q(root, '.drop-zone');
  const patchBtn = q<HTMLButtonElement>(root, '.patch-btn');
  const dlSection = q(root, '.download-section');

  // Remove listeners from any previous call for this root
  patchAbort.get(root)?.abort();
  const ac = new AbortController();
  patchAbort.set(root, ac);

  // Reset from any previous run
  dlSection.hidden = true;
  patchBtn.disabled = true;
  dropZone.dataset.state = 'loading';
  setStatus(root, `Loading ${file.name}…`);

  // ── Read & verify ───────────────────────────────────────────────────────────
  let files: Record<string, Uint8Array>;

  try {
    files = readZip(await file.arrayBuffer());
  } catch {
    dropZone.dataset.state = 'error';
    setStatus(root, 'Could not read zip file.', 'error');
    return;
  }

  try {
    setStatus(root, 'Verifying ROM checksums…');
    verifyCRCs(gameData.roms.regions, files);
  } catch (err) {
    dropZone.dataset.state = 'error';
    setStatus(root, err instanceof Error ? err.message : String(err), 'error');
    return;
  }

  // ── ROM verified ────────────────────────────────────────────────────────────
  dropZone.dataset.state = 'ok';
  q(dropZone, '.drop-label').textContent = file.name;
  setStatus(root, 'ROM verified — select hacks and click Patch.', 'ok');

  const scope = root.closest<HTMLElement>('.game-patchers') ?? root;
  const checkboxes = [...scope.querySelectorAll<HTMLInputElement>('input.hack-checkbox')];
  const syncBtn = () => { patchBtn.disabled = !checkboxes.some(cb => cb.checked); };
  checkboxes.forEach(cb => cb.addEventListener('change', syncBtn, { signal: ac.signal }));
  syncBtn();

  patchBtn.addEventListener('click', async () => {
    patchBtn.disabled = true;
    patchBtn.dataset.state = 'loading';
    dlSection.hidden = true;
    setStatus(root, 'Patching…');

    try {
      const enabled = new Set(
        checkboxes.filter(cb => cb.checked).map(cb => parseInt(cb.value, 10)),
      );

      const patches = resolveHackPatches(gameData.roms, gameData.hacks, enabled);
      const patched = applyPatches(patches, files);
      const output = writeZip(patched);

      // Build download URL
      const dlLink = q<HTMLAnchorElement>(root, '.download-link');
      if (dlLink.href.startsWith('blob:')) URL.revokeObjectURL(dlLink.href);
      dlLink.href = URL.createObjectURL(new Blob([new Uint8Array(output)], { type: 'application/zip' }));
      dlLink.download = file.name;
      dlSection.hidden = false;

      setStatus(root, `${enabled.size} hack(s) applied.`, 'ok');
    } catch (err) {
      setStatus(root, err instanceof Error ? err.message : String(err), 'error');
      syncBtn();
    } finally {
      delete patchBtn.dataset.state;
    }
  }, { signal: ac.signal });
}
