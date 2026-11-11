// node tests/frontmatter.test.cjs
// Checks that every SKILL.md frontmatter loads: name matches the folder, description is at most 1024 characters,
// and nothing would break YAML parsing (": " or " #" in an unquoted value, or a value that starts with a quote, [ or { and is never closed).
// plugin validate does not always catch broken YAML, but the installed skill can't be read, so this test catches it separately.
const fs = require('fs');
const path = require('path');

const SKILLS = path.join(__dirname, '..', 'skills');
const problems = [];
const dirs = fs.readdirSync(SKILLS).filter(d => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')));
for (const dir of dirs) {
  const file = path.join('skills', dir, 'SKILL.md');
  const text = fs.readFileSync(path.join(SKILLS, dir, 'SKILL.md'), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) { problems.push(`${file}: no frontmatter`); continue; }
  const fields = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z][\w-]*): ?(.*)$/);
    if (!kv) { if (line.trim()) problems.push(`${file}: cannot parse this line "${line.slice(0, 40)}" (use > or | for multi-line values)`); continue; }
    fields[kv[1]] = kv[2];
  }
  if (fields.name !== dir) problems.push(`${file}: name is "${fields.name}"; it must match the folder name "${dir}"`);
  const d = fields.description;
  if (!d) { problems.push(`${file}: missing description`); continue; }
  const quoted = /^".*"$/.test(d) || /^'.*'$/.test(d);
  if (!quoted) {
    if (/: /.test(d)) problems.push(`${file}: description is unquoted and contains ": ", so YAML parsing fails (use a dash or a full-width colon, or quote the whole value)`);
    if (/ #/.test(d)) problems.push(`${file}: description is unquoted and contains " #"; everything after it is read as a comment`);
    if (/^["'[{>|&*!%@`]/.test(d)) problems.push(`${file}: description starts with a special character and must be quoted`);
  }
  const len = quoted ? d.length - 2 : d.length;
  if (len > 1024) problems.push(`${file}: description is ${len} characters, over 1024`);
}
if (problems.length) { problems.forEach(p => console.log('FAIL ' + p)); process.exit(1); }
console.log(`ok   frontmatter of all ${dirs.length} skills loads`);
