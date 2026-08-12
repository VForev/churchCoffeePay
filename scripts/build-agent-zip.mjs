/**
 * Bundles the print agent into `public/print-agent.zip`, which the shop PC
 * downloads from /admin/print-setup.
 *
 * Runs automatically before `npm run dev` and `npm run build` (see the "predev"
 * and "prebuild" scripts in package.json), so the download is always rebuilt from
 * the current source — it can never go stale, and the zip is never committed.
 *
 * The agent imports a few files from the website's own source (`src/lib/labels.ts`,
 * `src/lib/temperature.ts` and `src/lib/logo.ts`) so its layout math can't drift from
 * the admin preview. Those are bundled at their real relative path, so once unzipped the
 * `../src/lib/...` imports still resolve. Structure of the zip:
 *
 *   print-agent/     <- everything the user runs; `cd` in here
 *   src/lib/         <- the two shared files, kept next to it
 *
 * Pure Node, zero dependencies (a tiny DEFLATE zip writer lives at the bottom),
 * so it works in any build environment without an npm install.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Exactly what the agent needs — no node_modules, no .env, no lockfile.
const FILES = [
  'print-agent/agent.ts',
  'print-agent/label.ts',
  'print-agent/printer.ts',
  'print-agent/package.json',
  'print-agent/tsconfig.json',
  'print-agent/.env.example',
  'print-agent/README.md',
  'print-agent/start-printer.bat',
  'print-agent/start-printer.command',
  'src/lib/labels.ts',
  'src/lib/temperature.ts',
  // The church mark, embedded as base64 so the agent and the admin preview print the
  // identical artwork without a shared image file.
  'src/lib/logo.ts',
];

function main() {
  const entries = FILES.map((rel) => ({
    name: rel,
    data: readFileSync(join(root, rel)),
  }));

  // A version stamp the launcher prints on the shop PC, so "is that machine running the
  // code I just pushed?" is a question you can answer by reading the screen instead of
  // guessing. It's a hash of the contents, not a timestamp, so an unchanged build produces
  // an unchanged zip — otherwise every `npm run dev` would show up as a git change.
  const hash = createHash('sha256');
  for (const entry of entries) hash.update(entry.name).update(entry.data);
  const version = hash.digest('hex').slice(0, 8);
  entries.push({ name: 'print-agent/VERSION.txt', data: Buffer.from(`${version}\n`, 'utf8') });

  const zip = makeZip(entries);
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'public', 'print-agent.zip'), zip);
  // The same stamp, readable by the browser, so /admin/print-setup can show what the
  // shop PC *should* be running next to what it says it is running.
  writeFileSync(join(root, 'public', 'print-agent-version.txt'), `${version}\n`);

  console.log(
    `Built public/print-agent.zip (${entries.length} files, ${zip.length} bytes, version ${version})`,
  );
}

// ─── A minimal, dependency-free ZIP writer (DEFLATE / method 8) ────────────────

function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const compressed = deflateRawSync(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01, arbitrary but valid)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    chunks.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(8, 10); // method
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0x21, 14); // mod date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(file.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk number
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(files.length, 8); // entries on this disk
  end.writeUInt16LE(files.length, 10); // total entries
  end.writeUInt32LE(centralBuf.length, 12); // central dir size
  end.writeUInt32LE(offset, 16); // central dir offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, centralBuf, end]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

main();
