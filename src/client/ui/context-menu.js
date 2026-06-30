'use strict';
(function installNv142ContextMenu(){
  function placeWithinViewport(node, x, y, pad = 12){
    if (!node) return;
    if (!node.parentNode) document.body.appendChild(node);
    node.style.position = 'fixed';
    node.style.maxWidth = Math.min(420, window.innerWidth - pad * 2) + 'px';
    node.style.maxHeight = Math.max(180, window.innerHeight - pad * 2) + 'px';
    node.style.overflow = 'auto';
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
  window.NV142ContextMenu = { placeWithinViewport };
})();
