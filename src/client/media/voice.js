'use strict';
(function installNv142VoiceModule(){
  const registry = new Map();
  function get(id){ const key = String(id || ''); if(!registry.has(key)) registry.set(key, { currentTime:0, duration:0, playbackRate:1, isPlaying:false, waveform:[] }); return registry.get(key); }
  function save(id, data={}){ Object.assign(get(id), data, { updatedAt: Date.now() }); }
  function stopOthers(id){ for (const [key,state] of registry) if(key !== String(id||'')) state.isPlaying = false; }
  window.NV142Voice = { registry, get, save, stopOthers };
})();
