// Minimal CI check: the game file exists, has a title, and its inline scripts parse.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
if (!/<title>[^<]+<\/title>/.test(html)) throw new Error('index.html has no <title>');

let count = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)) {
  new vm.Script(m[1]); // throws on a syntax error
  count++;
}
console.log(`ok: index.html parsed, ${count} inline script(s)`);

// Plain scripts and ES modules under src/ must parse too.
const src = path.join(__dirname, '..', 'src');
if (fs.existsSync(src)) {
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(src, f), 'utf8').replace(/^\s*import\s[^\n]*$/gm, '').replace(/^(\s*)export\s+default\s+/gm, '$1').replace(/^(\s*)export\s+/gm, '$1');
    new vm.Script(code);
    console.log('ok: src/' + f + ' parsed');
  }
}

// People module: syntax check and headless simulation test.
if (fs.existsSync(path.join(__dirname, '..', 'src', 'people.js'))) {
  new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'src', 'people.js'), 'utf8'));
  require('./test-people.js');
}
