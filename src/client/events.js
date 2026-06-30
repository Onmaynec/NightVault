'use strict';
(function installNv142Events(){
  const target = new EventTarget();
  window.NV142Events = { on:(name,fn)=>target.addEventListener(name,fn), off:(name,fn)=>target.removeEventListener(name,fn), emit:(name,detail)=>target.dispatchEvent(new CustomEvent(name,{detail})) };
})();
