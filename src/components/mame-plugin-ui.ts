import { writeZip } from "../lib/zip";
import type { Hack } from "../lib/patcher";

/** Escape a string for safe embedding inside a Lua double-quoted string literal. */
function luaStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

function generatePluginJson(gameId: string, gameName: string): string {
  const pluginName = `${gameId}-hacks`;
  return JSON.stringify(
    {
      plugin: {
        name: pluginName,
        description: `${gameName} ROM hacks`,
        version: "1.0.0",
        author: "https://github.com/itisflo",
        type: "plugin",
        start: "true",
      },
    },
    null,
    "\t",
  );
}

function generateInitLua(
  gameId: string,
  gameName: string,
  hacks: Hack[],
  enabledIndices: Set<number>,
): string {
  const pluginName = `${gameId}-hacks`;

  const patchLines: string[] = [];
  for (const [i, hack] of hacks.entries()) {
    if (!enabledIndices.has(i) || !hack.memory?.length) continue;
    patchLines.push(`\t\t-- ${luaStr(hack.description)}`);
    for (const { address, value } of hack.memory) {
      const addrHex = `0x${address.toString(16).toUpperCase().padStart(6, "0")}`;
      const valHex = `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
      patchLines.push(`\t\t{ addr = ${addrHex}, val = ${valHex} },`);
    }
  }

  const patchesBlock =
    patchLines.length > 0 ? patchLines.join("\n") : "\t\t-- no patches selected";

  return `-- license:BSD-3-Clause
local exports = {
\tname = "${luaStr(pluginName)}",
\tversion = "1.0.0",
\tdescription = "${luaStr(gameName)} ROM hacks",
\tlicense = "BSD-3-Clause",
\tauthor = { name = "https://github.com/itisflo" }
}

local plugin = exports

local reset_subscription

function plugin.startplugin()
\tlocal patches = {
${patchesBlock}
\t}

\treset_subscription = emu.add_machine_reset_notifier(function()
\t\tif emu.romname() ~= "${luaStr(gameId)}" then return end
\t\tlocal region = manager.machine.memory.regions[":maincpu"]
\t\tif not region then return end
\t\tfor _, p in ipairs(patches) do
\t\t\tregion:write_u16(p.addr, p.val)
\t\tend
\t\temu.print_info("${luaStr(pluginName)}: ROM patched")
\tend)
end

return exports
`;
}

export function downloadMamePlugin(
  gameId: string,
  gameName: string,
  hacks: Hack[],
  enabledIndices: Set<number>,
): void {
  const pluginName = `${gameId}-hacks`;

  const initLua = generateInitLua(gameId, gameName, hacks, enabledIndices);
  const pluginJson = generatePluginJson(gameId, gameName);

  const encoder = new TextEncoder();
  const zip = writeZip({
    [`${pluginName}/init.lua`]: encoder.encode(initLua),
    [`${pluginName}/plugin.json`]: encoder.encode(pluginJson),
  });

  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pluginName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
