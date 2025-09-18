// vaultforge-5etools/scripts/generate-class-index.js
// Run with: node vaultforge-5etools/scripts/generate-class-index.js
// Generates vaultforge-5etools/data/class/index.json containing { class, subclasses[], location }

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data', 'class');
const outPath = path.join(dir, 'index.json');

function isClassFile(fn) {
  return fn.startsWith('class-') && fn.endsWith('.json') && !fn.startsWith('fluff-') && fn !== 'index.json';
}

const files = fs.readdirSync(dir).filter(isClassFile);
const out = [];
for (const file of files) {
  try {
    const full = path.join(dir, file);
    const txt = fs.readFileSync(full, 'utf8');
    const j = JSON.parse(txt);
    let className = null;
    if (Array.isArray(j.class) && j.class[0] && j.class[0].name) className = j.class[0].name;
    if (!className) className = file.replace(/^class-/, '').replace(/\.json$/,'');
    const subclasses = Array.isArray(j.subclass) ? j.subclass.map(s => s && (s.name || s.shortName)).filter(Boolean) : [];
    const uniq = Array.from(new Set(subclasses));
    out.push({ class: className, subclasses: uniq, location: file });
  } catch (e) {
    console.error('failed', file, e.message);
  }
}
// sort by class name
out.sort((a,b)=>String(a.class).localeCompare(String(b.class)));
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', outPath, 'with', out.length, 'entries');
