'use strict';
(function installNv143VoiceModule(){
  const registry = new Map();
  async function listMicrophones(){
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device)=>device.kind === 'audioinput').map((device, index)=>({ deviceId:device.deviceId, label:device.label || `Микрофон ${index + 1}` }));
  }
  async function testMicrophone(deviceId){
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('MediaDevices API недоступен');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId:{ exact:deviceId } } : true });
    let level = 0;
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      const source = ctx.createMediaStreamSource(stream);
      const data = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      await new Promise((resolve)=>setTimeout(resolve, 220));
      analyser.getByteFrequencyData(data);
      level = Math.round(data.reduce((a,b)=>a+b,0) / Math.max(1, data.length));
      await ctx.close().catch(()=>{});
    } finally { stream.getTracks().forEach((track)=>track.stop()); }
    return { ok:true, level };
  }
  function get(id){ const key = String(id || ''); if(!registry.has(key)) registry.set(key, { currentTime:0, duration:0, playbackRate:1, isPlaying:false, waveform:[], deviceId:localStorage.nvSelectedMicId || '' }); return registry.get(key); }
  function save(id, data={}){ Object.assign(get(id), data, { updatedAt: Date.now() }); }
  function stopOthers(id){ for (const [key,state] of registry) if(key !== String(id||'')) state.isPlaying = false; }
  window.NV143Voice = window.NV142Voice = { registry, get, save, stopOthers, listMicrophones, testMicrophone };
})();
/* Voice Recorder 2.2 */
