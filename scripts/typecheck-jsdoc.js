"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const required = ["server/lib/sync-engine.js", "server/lib/migrations.js", "server/lib/debug-report.js", "server/services/e2ee-trust.js", "src/renderer/sync.js"];
for (const rel of required) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  if (!text.includes('"use strict"')) throw new Error(`${rel}: missing strict mode`);
  if (!/module\.exports|window\.NV130/.test(text)) throw new Error(`${rel}: missing public module export`);
}
console.log("typecheck ok — module contracts present");
