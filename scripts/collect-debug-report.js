"use strict";
const { db, sqliteStatus } = require("../server/lib/store");
const config = require("../server/lib/config");
const { collectReadinessReport } = require("../server/services/readiness");
const { buildDebugReport } = require("../server/lib/debug-report");
const report = buildDebugReport({ db, sqliteStatus: sqliteStatus(), readiness: collectReadinessReport(db, config), serverStatus: { offlineScript: true } });
console.log(JSON.stringify(report, null, 2));
