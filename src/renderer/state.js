"use strict";
window.NV130State = Object.freeze({
  version: "1.3.0",
  syncHistoryKey(username = "guest") { return `nvSyncHistory_${username}`; },
  decryptedIndexKey(username = "guest") { return `nvDecryptedSearchIndex_${username}`; },
  trustKey(username = "guest") { return `nvE2eeTrust_${username}`; },
});
