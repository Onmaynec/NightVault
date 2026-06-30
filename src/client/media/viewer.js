'use strict';
(function installNv143MediaModule(){
  const state = { items:[], index:0 };
  function normalizeSource(value){
    const src = typeof value === 'string' ? value : (value?.src || value?.url || value?.previewUrl || '');
    if (/^blob:|^data:image\//i.test(src)) return { src, direct:true };
    if (/\/api\/files\//.test(src)) return { src, api:true };
    return { src };
  }
  function setItems(items=[], index=0){ state.items = items.map(normalizeSource).filter((x)=>x.src); state.index = Math.max(0, Math.min(index, state.items.length - 1)); }
  function current(){ return state.items[state.index] || null; }
  function open(value, meta={}){
    const item = normalizeSource(value);
    if(!item.src) return false;
    if (Array.isArray(meta.items)) setItems(meta.items, meta.index || 0); else setItems([item], 0);
    return window.openMediaViewerByRef137 ? window.openMediaViewerByRef137(item.src, meta) : false;
  }
  function next(){ if(state.items.length > 1) { state.index = (state.index + 1) % state.items.length; return open(current(), { items:state.items, index:state.index }); } return false; }
  function prev(){ if(state.items.length > 1) { state.index = (state.index - 1 + state.items.length) % state.items.length; return open(current(), { items:state.items, index:state.index }); } return false; }
  window.addEventListener('keydown', (event)=>{ if(event.key === 'ArrowRight') next(); if(event.key === 'ArrowLeft') prev(); if(event.key === 'Escape') window.closeMediaViewer?.() || window.closeModal?.(); });
  window.NV143Media = window.NV142Media = { normalizeSource, open, next, prev, setItems, current, state, label:'Media Viewer 2.2' };
})();
