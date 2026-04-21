// One-shot export: writes matlack-glyphs.json from the current glyph geometry.
// Run: node scripts/export_glyphs.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { exportGlyphsForFont } from '../src/styles/matlackSVGExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, '..', 'matlack-glyphs.json');

const json = exportGlyphsForFont();
fs.writeFileSync(out, json);
console.log(`wrote ${out} (${json.length} bytes)`);
