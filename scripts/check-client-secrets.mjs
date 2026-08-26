import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbidden = [/JENKINS_API_TOKEN/i, /OPENAI_API_KEY/i, /Authorization\s*:/i];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".next", "node_modules", "dist"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|css|md)$/.test(entry.name)) files.push(full);
  }
}
walk(root);
const findings = files.flatMap((file) => {
  if (file === path.join(root, "scripts", "check-client-secrets.mjs")) return [];
  const content = fs.readFileSync(file, "utf8");
  return forbidden.filter((pattern) => pattern.test(content)).map((pattern) => `${file}: ${pattern}`);
});
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log(`Checked ${files.length} source files.`);
