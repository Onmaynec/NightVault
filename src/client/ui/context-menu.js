'use strict';
(function installNv143ContextMenu(){
  function closeAll(){ document.querySelectorAll('.ctx,.nvContextMenu').forEach((node)=>node.remove()); }
  function placeWithinViewport(node, x, y, options = {}){
    if (!node) return;
    const pad = options.pad || 12;
    if (!node.parentNode) document.body.appendChild(node);
    node.classList.add('nvContextMenu');
    node.style.position = 'fixed';
    node.style.maxWidth = Math.min(420, Math.max(180, window.innerWidth - pad * 2)) + 'px';
    node.style.maxHeight = Math.max(160, window.innerHeight - pad * 2) + 'px';
    node.style.overflow = 'auto';
    node.style.zIndex = '9999';
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const w = Math.min(rect.width || 260, window.innerWidth - pad * 2);
      const h = Math.min(rect.height || 260, window.innerHeight - pad * 2);
      let left = Number.isFinite(x) ? x : pad;
      let top = Number.isFinite(y) ? y : pad;
      if (left + w + pad > window.innerWidth) left = window.innerWidth - w - pad;
      if (top + h + pad > window.innerHeight) top = window.innerHeight - h - pad;
      node.style.left = Math.max(pad, left) + 'px';
      node.style.top = Math.max(pad, top) + 'px';
    });
  }
  function openMenuAt(x, y, html){
    closeAll();
    const node = document.createElement('div');
    node.className = 'ctx nvContextMenu';
    node.insertAdjacentHTML('afterbegin', html);
    document.body.appendChild(node);
    placeWithinViewport(node, x, y);
    return node;
  }
  document.addEventListener('keydown', (event)=>{ if(event.key === 'Escape') closeAll(); });
  document.addEventListener('pointerdown', (event)=>{ const hit = event.target?.closest?.('.ctx,.nvContextMenu'); if(!hit) closeAll(); }, true);
  window.NvContextMenu = window.NV143ContextMenu = window.NV142ContextMenu = { placeWithinViewport, openMenuAt, closeAll };
})();
