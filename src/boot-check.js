"use strict";
(function bootCheck() {
  const app = document.querySelector("#app");
  const bootHtml = `
    <div class="auth">
      <div class="authBox panelIn">
        <div class="logo">Night<span>Vault</span></div>
        <div class="small">Загрузка интерфейса…</div>
        <div class="bootLoader"></div>
      </div>
    </div>`;
  if (app && !app.children.length) app.innerHTML = bootHtml;
  window.NV_BOOT_CHECK_STARTED = true;
  setTimeout(() => {
    if (window.NV_RENDERER_STARTED || window.NV_APP_READY) return;
    const root = document.querySelector("#app");
    if (!root) return;
    try { window.nv?.clientReport?.({ type: "boot-timeout", message: "Renderer did not set NV_RENDERER_STARTED/NV_APP_READY in time" }); } catch {}
    root.innerHTML = `
      <div class="auth">
        <div class="authBox panelIn">
          <div class="logo">Night<span>Vault</span></div>
          <h2>Интерфейс не загрузился</h2>
          <div class="small">Renderer-скрипты не выполнились. Запусти start-client-debug.bat и пришли текст ошибки из DevTools/консоли.</div>
          <button class="btn" id="nvBootReload" type="button" style="width:100%;margin-top:12px">Перезагрузить</button>
        </div>
      </div>`;
    document.querySelector("#nvBootReload")?.addEventListener("click", () => location.reload());
  }, 6000);
})();
