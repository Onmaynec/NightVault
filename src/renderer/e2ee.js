"use strict";
(function installNv130E2eeTrustHelpers(){
  function bytesToHex(buffer){return [...new Uint8Array(buffer)].map((b)=>b.toString(16).padStart(2,"0")).join("");}
  async function fingerprint(publicKey){const text=JSON.stringify(publicKey||{},Object.keys(publicKey||{}).sort());const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return bytesToHex(hash).match(/.{1,4}/g).slice(0,12).join(" ").toUpperCase();}
  async function exportEncryptedKeyBundle(payload,password){const salt=crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(password||"")),"PBKDF2",false,["deriveKey"]);const key=await crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:300000},material,{name:"AES-GCM",length:256},false,["encrypt"]);const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(payload||{})));return {format:"nightvault-e2ee-key-bundle",version:3,salt:btoa(String.fromCharCode(...salt)),iv:btoa(String.fromCharCode(...iv)),ciphertext:btoa(String.fromCharCode(...new Uint8Array(data))),warning:"Без recovery key старые E2EE сообщения не восстановятся."};}
  window.NV130E2EE = Object.freeze({version:"1.3.0", fingerprint, exportEncryptedKeyBundle});
})();
