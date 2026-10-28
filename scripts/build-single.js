// Builds one self-contained HTML file: inlines src/*.js into index.html (Three.js stays on its CDN).
// Usage: node scripts/build-single.js [out.html]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, f) => `<script>\n${safe(read(f))}\n</script>`);
html = html.replace(/import \{[^}]*\} from "\.\/src\/camera\.js";/, () => safe(read('src/camera.js').replace(/^export\s+/gm, '')));
const out = process.argv[2] || path.join(root, 'dist', 'vacancy.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
