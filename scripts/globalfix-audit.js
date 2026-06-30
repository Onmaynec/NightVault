"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

const renderer = read("src/renderer.js");
const style = read("src/style.css");
const adminRenderer = read("src/admin-renderer.js");
const adminCss = read("src/admin.css");
const store = read("server/lib/store.js");
const pkg = JSON.parse(read("package.json"));

check("package semver 1.3.8", pkg.version === "1.3.8", pkg.version);
check("UI release label", renderer.includes("1.3.8") && adminRenderer.includes("1.3.8"));
check("api files endpoint not double-prefixed", renderer.includes("function apiEndpoint") && renderer.includes('value.startsWith("/api/")') && renderer.includes("getServerHttp() + value"));
check("chat uses margin-top:auto bottom stack", style.includes(".messagesInner") && style.includes("margin-top:auto") && style.includes(".mineWrap{justify-content:flex-end"));
check("chat does not use legacy spacer hack", !renderer.includes('<div class="messageBottomSpacer"></div>'));
check("render blocks are protected", renderer.includes("safeRenderBlock") && renderer.includes("renderError"));
check("asset hydration is guarded", renderer.includes("nvAssetState") && renderer.includes("Promise.allSettled") && renderer.includes("data-fallback"));
check("avatar upload cannot blank client", renderer.includes("setProfileAssetPreview") && renderer.includes("safeProfileRenderAfterAsset") && renderer.includes("loadChats(false).catch"));
check("profile images are validated", renderer.includes("validatePickedProfileImage") && renderer.includes("createImageBitmap") && renderer.includes("SVG/HTML/XML запрещены"));
check("tab switching is centralized", renderer.includes("function switchTab") && adminRenderer.includes("function switchAdminTab"));
check("E2EE label hidden", style.includes(".e2eeBadge") && style.includes("display:none!important"));
check("Ivory Frost chat background disabled", style.includes("chatbg-frost") && renderer.includes('S.chatBg === "frost"'));
check("admin database viewer", adminRenderer.includes("Database Viewer 2.0") && adminRenderer.includes("state.loadedTable!==state.table") && adminRenderer.includes("dbLimit"));
check("admin table cells are server-side truncated", store.includes("previewCell") && store.includes('table === "reputation" ? 900'));
check("admin table layout is constrained", adminCss.includes("table-layout:fixed") && adminCss.includes("tableToolbar"));
check("settings layout has responsive grid", style.includes("settingsLayout") && style.includes("auto-fit"));

check("1.3.8 optimistic avatar preview", renderer.includes("setTemporaryProfilePreview") && renderer.includes("_avatarPreviewUrl") && renderer.includes("assetUploading.avatar"));
check("1.3.8 chat bottom observer", renderer.includes("ensureChatBottomWatch") && renderer.includes("MutationObserver") && renderer.includes("ResizeObserver"));
check("1.3.8 admin row limit", adminRenderer.includes("tableLimit") && adminRenderer.includes("dbLimit") && adminCss.includes(".dbMain"));
check("1.3.8 UI cleanup css", style.includes("NightVault 1.3.8") && style.includes("chatEmptyState") && style.includes("uploadNotice"));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "OK" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}
if (failed.length) {
  console.error(`NightVault 1.3.8 audit failed: ${failed.length} checks failed.`);
  process.exit(1);
}
console.log(`NightVault 1.3.8 audit passed: ${checks.length} checks.`);

