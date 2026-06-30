'use strict';
(function installNv142ToastHelpers(){
  window.NV142Toast = {
    info(message){ try { window.toast?.(message); } catch {} },
    error(message){ try { window.toast?.(message); } catch {} },
  };
})();
