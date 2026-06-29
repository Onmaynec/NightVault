"use strict";
(function installNv130SyncClient(){
  function loadHistory(username="guest"){try{return JSON.parse(localStorage[window.NV130State?.syncHistoryKey(username)||`nvSyncHistory_${username}`]||"[]");}catch{return []}}
  function saveHistory(username="guest", item={}){const key=window.NV130State?.syncHistoryKey(username)||`nvSyncHistory_${username}`;const list=loadHistory(username);list.push({time:Date.now(),...item});localStorage[key]=JSON.stringify(list.slice(-200));return list;}
  function event(entity, operation, payload={}, meta={}){const createdAt=Date.now();const clientId=localStorage.nvClientId||(localStorage.nvClientId=`client_${createdAt.toString(36)}_${Math.random().toString(36).slice(2,8)}`);const entityId=String(meta.entityId||payload.id||`${entity}_${createdAt.toString(36)}`);return {eventId:`ev_${createdAt.toString(36)}_${Math.random().toString(36).slice(2,8)}`,clientId,deviceId:localStorage.nvE2eeDeviceId||"default",entity,entityId,operation,version:Number(meta.version||payload.version||1),createdAt,idempotencyKey:`${clientId}:${entity}:${entityId}:${operation}:${meta.version||payload.version||1}`,payload};}
  window.NV130Sync = Object.freeze({version:"1.3.0", loadHistory, saveHistory, event});
})();
