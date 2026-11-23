import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skill = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = resolve(skill, "references/webnovel");
const names = [
  "01-genre-and-tone.md",
  "02-trope-patterns.md",
  "03-golden-finger-setting.md",
  "04-payoff-and-pacing.md",
  "05-characters-relationships.md",
  "06-scene-craft.md",
  "07-writing-techniques.md",
  "08-naming-rules.md",
];
const index = readFileSync(resolve(dir, "README.md"), "utf8");
const skillEntry = readFileSync(resolve(skill, "SKILL.md"), "utf8");
assert.match(skillEntry, /references\/webnovel\/README\.md/, "SKILL.md must route to the reference index");
for (const file of names) {
  const path = resolve(dir, file);
  assert.ok(existsSync(path), file + " missing");
  const s = readFileSync(path, "utf8");
  assert.ok(s.length >= 1400, file + " has too little usable content");
  assert.match(s, /^# .+/m, file + " lacks heading");
  assert.match(s, /^## .+/m, file + " lacks navigable sections");
  assert.match(s, /^\|.*\|/m, file + " lacks practical examples");
  assert.ok(index.includes("(" + file + ")"), file + " not indexed");
}
for (const file of ["SKILL.md", "README_V3.md", "references/v3/workflow.md", "references/v3/creative-lab.md", "references/v3/story-architecture.md"]) {
  const path = resolve(skill, file);
  const content = readFileSync(path, "utf8");
  for (const m of content.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)) {
    const target = resolve(dirname(path), m[1]);
    assert.ok(existsSync(target), file + ": broken local link " + m[1]);
  }
}
console.log("Webnovel reference libraries: 8 files, index, skill routing and local links OK");
