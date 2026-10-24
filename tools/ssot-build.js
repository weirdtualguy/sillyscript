#!/usr/bin/env node
// tools/ssot-build.js — concatenate docs/ssot modules (order from docs/ssot/modules.json)
// into one SSOT.md for attaching to an AI chat or printing.
//   node tools/ssot-build.js [out.md]     (default: stdout)
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'docs', 'ssot');
const { modules } = JSON.parse(fs.readFileSync(path.join(dir, 'modules.json'), 'utf8'));
const out = modules.map(m => fs.readFileSync(path.join(dir, m), 'utf8')).join('');
if (process.argv[2]) { fs.writeFileSync(process.argv[2], out); console.error('wrote ' + process.argv[2] + ' (' + out.length + ' bytes)'); }
else process.stdout.write(out);
