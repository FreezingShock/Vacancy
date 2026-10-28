// Minimal CI check: the game file exists, has a title, and its inline scripts parse.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
if (!/<title>[^<]+<\/title>/.test(html)) throw new Error('index.html has no <title>');

let count = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  new vm.Script(m[1]); // throws on a syntax error
  count++;
}
console.log(`ok: index.html parsed, ${count} inline script(s)`);
