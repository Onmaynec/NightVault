"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const files = [];
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);const st=fs.statSync(p);if(st.isDirectory()&&!name.startsWith("node_modules")&&!name.startsWith("dist"))walk(p);else if(/\.js$/.test(name))files.push(p);}}
for (const dir of ["src", "server", "scripts", "tests"]) walk(path.join(root, dir));
let failures = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (/eval\s*\(/.test(text)) { console.error("lint: eval is forbidden", path.relative(root, file)); failures++; }
  if (/innerHTML\s*=\s*[^`'"]/.test(text) && !/admin-renderer|renderer\.js|boot-check/.test(file)) { console.error("lint: unsafe innerHTML assignment", path.relative(root, file)); failures++; }
  if (/TODO\s*:\s*skip/i.test(text)) { console.error("lint: skipped TODO", path.relative(root, file)); failures++; }
}
if (failures) process.exit(1);
console.log(`lint ok — ${files.length} files checked`);
