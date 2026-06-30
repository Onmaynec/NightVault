'use strict';
(function installNv142UiActionRouter(){
  const registry = new Map();
  const debug = [];
  function log(action, payload, error){
    debug.push({ time: Date.now(), action, payload, error: error ? String(error.message || error) : '' });
    if (debug.length > 120) debug.shift();
  }
  function register(name, handler){ if (typeof name === 'string' && typeof handler === 'function') registry.set(name, handler); }
  async function run(action, payload){
    const name = String(action || '').trim();
    const handler = registry.get(name);
    if (!handler) { log(name, payload, 'unknown action'); try { window.toast?.('UI action не распознано: ' + name); } catch {} return { ok:false, unknown:true, action:name }; }
    try { const result = await handler(payload); return result || { ok:true }; }
    catch (error) { log(name, payload, error); try { window.toast?.('Ошибка UI action: ' + (error.message || error)); } catch {} return { ok:false, error:String(error.message || error) }; }
  }
  window.NV142Actions = { register, run, debug, has:(name)=>registry.has(String(name || '')) };
  window.uiAction = run;
  const safe = (name, fn) => register(name, fn);
  safe('emoji.close', () => window.closeEmojiPanel?.());
  safe('emoji.pick', (emoji) => window.pickEmoji?.(emoji));
  safe('message.reply', (id) => window.reply?.(id));
  safe('message.forward', (id) => window.forwardMessage139?.(id));
  safe('message.react', (payload) => window.react?.(payload?.id, payload?.emoji));
  safe('message.delete', (id) => window.deleteMessage?.(id));
  safe('message.pin', (id) => window.pinMessage?.(id));
  safe('profile.open', (username) => window.openUserProfile?.(username));
  safe('profile.report', (username) => window.reportUser139?.(username));
  safe('group.settings', (chatId) => window.openGroupSettings?.(chatId));
  safe('group.avatar', (chatId) => window.nv135PickGroupAvatar?.(chatId));
  safe('media.open', (payload) => window.openMediaViewerByRef137?.(payload?.url || payload));
  safe('voice.play', (id) => window.playVoice137?.(id));
  safe('voice.pause', (id) => window.pauseVoice137?.(id));
  safe('settings.save', () => window.saveSettings?.());
  safe('e2ee.recovery', () => window.nv142OpenE2eeRecovery?.());
})();
