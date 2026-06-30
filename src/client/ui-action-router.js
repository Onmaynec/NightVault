'use strict';
(function installNv143UiActionRouter(){
  const registry = new Map();
  const debug = [];
  function log(action, payload, error){
    debug.push({ time: Date.now(), action, payload, error: error ? String(error.message || error) : '' });
    if (debug.length > 200) debug.shift();
    try { console.debug('[NightVault UI action]', action, error || ''); } catch {}
  }
  function register(name, handler){ if (typeof name === 'string' && typeof handler === 'function') registry.set(name, handler); }
  async function run(action, payload){
    const name = String(action || '').trim();
    const handler = registry.get(name);
    if (!handler) { log(name, payload, 'unknown action'); return { ok:false, unknown:true, action:name }; }
    try { const result = await handler(payload); return result || { ok:true }; }
    catch (error) { log(name, payload, error); try { window.toast?.('Действие не выполнено: ' + (error.message || error)); } catch {} return { ok:false, error:String(error.message || error) }; }
  }
  window.NV143Actions = window.NV142Actions = { register, run, debug, has:(name)=>registry.has(String(name || '')), list:()=>[...registry.keys()].sort() };
  window.uiAction = run;
  const safe = (name, fn) => register(name, fn);
  safe('emoji.close', () => window.closeEmojiPanel?.());
  safe('emoji.open', () => window.toggleEmoji?.());
  safe('emoji.pick', (emoji) => window.pickEmoji?.(emoji));
  safe('voice.start', () => window.startVoice?.());
  safe('voice.stop', () => window.stopVoice?.());
  safe('voice.cancel', () => window.cancelVoice?.());
  safe('voice.preview', () => window.previewVoice?.());
  safe('voice.play', (id) => window.playVoice137?.(id));
  safe('voice.pause', (id) => window.pauseVoice137?.(id));
  safe('message.reply', (id) => window.reply?.(id));
  safe('message.forward', (id) => window.forwardMessage139?.(id));
  safe('message.react', (payload) => window.react?.(payload?.id, payload?.emoji));
  safe('message.delete', (id) => window.deleteMessage?.(id));
  safe('message.pin', (id) => window.pinMessage?.(id));
  safe('profile.open', (username) => window.openUserProfile?.(username));
  safe('profile.report', (username) => window.reportUser139?.(username));
  safe('group.settings', (chatId) => window.openGroupSettings?.(chatId));
  safe('group.avatar', (chatId) => window.nv135PickGroupAvatar?.(chatId));
  safe('media.open', (payload) => window.NV143Media?.open(payload));
  safe('media.close', () => window.closeMediaViewer?.() || window.closeModal?.());
  safe('modal.close', () => window.closeModal?.());
  safe('modal.confirm', (payload) => window.confirm?.(payload?.message || 'Подтвердить?'));
  safe('settings.save', () => window.saveSettings?.());
  safe('settings.microphone.refresh', () => window.nv141RefreshMicrophones?.());
  safe('settings.microphone.test', () => window.nv143TestMicrophone?.() || window.nv142TestMicrophone?.());
  safe('backup.preview', () => window.nv143BackupAssistant?.());
  safe('backup.import', () => window.nv143BackupAssistant?.());
  safe('theme.preview', () => window.nv143ThemePreviewLab?.());
  safe('tester.report', () => window.nv143TesterReport?.());
  safe('e2ee.recovery', () => window.nv143OpenE2eeChatStatus?.() || window.nv142OpenE2eeRecovery?.());
})();
