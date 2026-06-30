'use strict';
(function installNv142MediaModule(){
  function normalizeSource(value){
    const src = typeof value === 'string' ? value : (value?.src || value?.url || value?.previewUrl || '');
    if (/^blob:|^data:image\//i.test(src)) return { src, direct:true };
    if (/\/api\/files\//.test(src)) return { src, api:true };
    return { src };
  }
  function open(value, meta={}){ const item = normalizeSource(value); if(!item.src) return false; return window.openMediaViewerByRef137 ? window.openMediaViewerByRef137(item.src, meta) : false; }
  window.NV142Media = { normalizeSource, open };
})();
