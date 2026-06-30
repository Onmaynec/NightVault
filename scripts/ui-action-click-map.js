#!/usr/bin/env node
"use strict";

const actions = [
  { area: "guest", action: "settings.server.save", selector: "[data-action='settings.server.save']", expected: "server url saved" },
  { area: "settings", action: "settings.save", selector: "[data-action='settings.save']", expected: "settings toast" },
  { area: "contacts", action: "contacts.filter", selector: "[data-action='contacts.filter']", expected: "contacts list partial render" },
  { area: "profile", action: "profile.save", selector: "[data-action='profile.save']", expected: "profile saved" },
  { area: "e2ee", action: "e2ee.health.open", selector: "[data-action='e2ee.health.open']", expected: "E2EE health/trust panel" },
  { area: "voice", action: "voice.testMic", selector: "[data-action='voice.testMic']", expected: "microphone test result" },
  { area: "overlay", action: "overlay.closeAll", selector: "[data-action='overlay.closeAll']", expected: "all overlays closed" },
  { area: "admin", action: "admin.logs.export", selector: "[data-admin-action='admin.logs.export']", expected: "logs exported" },
];
console.log(JSON.stringify({ version: "1.4.7", actions }, null, 2));
