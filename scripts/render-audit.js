"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(name, ok, detail = "") { checks.push({ name, ok: Boolean(ok), detail }); }
function lastIndex(text, needle) { return text.lastIndexOf(needle); }

const renderer = read("src/renderer.js");
const style = read("src/style.css");
const admin = read("src/admin-renderer.js");
const adminCss = read("src/admin.css");
const main = read("src/main.js");
const index = read("src/index.html");
const adminHtml = read("src/admin.html");
const pkg = JSON.parse(read("package.json"));

check("release version is 1.4.0", pkg.version === "1.4.0", pkg.version);
check("renderer release label is 1.4.0", renderer.includes('const RELEASE_LABEL = "1.4.0"'));
check("admin titlebar label is 1.4.0", admin.includes("1.4.0"));
check("/api/files uses server root", renderer.includes('if (value.startsWith("/api/")) return getServerHttp() + value;'));
check("raw api uses apiEndpoint", renderer.includes("return await fetch(apiEndpoint(path)"));
check("avatar upload uses local preview before render", renderer.includes("setProfileAssetPreview(ref, file)") && renderer.includes("safeProfileRenderAfterAsset(\"Аватар\")"));
check("banner upload uses local preview before render", renderer.includes("safeProfileRenderAfterAsset(\"Баннер\")"));
check("profile image validation rejects unsafe vector/html", renderer.includes("SVG/HTML/XML запрещены"));
check("image fallback is bound after render", renderer.includes("img[data-fallback]") && renderer.includes("replaceWith(replacement)"));
check("boot error cannot replace rendered app", renderer.includes("if (app && !nvBootHasRendered)"));
check("chat container is flex column", /\.messages\{[^}]*display:flex!important[^}]*flex-direction:column!important/s.test(style));
check("bottom stack uses margin auto", /\.messagesInner\{[^}]*margin-top:auto!important[^}]*display:flex!important/s.test(style));
check("mine messages final align right", lastIndex(style, ".mineWrap{justify-content:flex-end!important") > lastIndex(style, ".mineWrap{justify-content:flex-start"));
check("composer is grid and non-sticky", /\.composer\{[^}]*display:grid!important[^}]*bottom:auto!important/s.test(style));
check("section pages hide side/list without blanking main", style.includes(".shell.section-settings .main") && style.includes("display:block!important") && style.includes(".shell.section-settings .list"));
check("admin db table reload checks selected table", admin.includes("state.loadedTable!==state.table"));
check("admin db has filter toolbar", admin.includes("dbSearch") && adminCss.includes("tableToolbar"));
check("admin test errors render into result", admin.includes("Ошибка теста"));
check("windows fullscreen pref sanitized off", main.includes("next.fullscreen = false"));
check("CSP allows blob images/media", index.includes("img-src 'self' data: blob:") && index.includes("media-src 'self' blob:"));
check("admin CSP allows blob images", adminHtml.includes("img-src 'self' data: blob:"));


check("1.4.0 optimistic avatar/banner preview", renderer.includes("setTemporaryProfilePreview") && renderer.includes("settleTemporaryProfilePreview") && renderer.includes("assetDisplayUrl"));
check("1.4.0 bottom lock observer", renderer.includes("ensureChatBottomWatch") && renderer.includes("chatDistanceFromBottom") && renderer.includes("S.chatPinnedBottom"));
check("1.4.0 chat empty state", renderer.includes("chatEmptyState") && style.includes(".chatEmptyState"));
check("1.4.0 admin limit toolbar", admin.includes("dbLimit") && adminCss.includes(".dbMain") && adminCss.includes(".miniLoader"));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "OK" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
if (failed.length) {
  console.error(`Render audit failed: ${failed.length} checks failed.`);
  process.exit(1);
}
console.log(`Render audit passed: ${checks.length} checks.`);
