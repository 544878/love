import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { exportBackup, readBackup } from "../lib/backup.ts";
import { exampleBackup } from "../lib/sample.ts";

const sample = exampleBackup("2026-11-18");
const roundTripAt = "2026-11-19T10:00:00.000Z";
const output = JSON.parse(exportBackup(readBackup(JSON.stringify(sample)), roundTripAt));
assert.deepEqual(output, { ...sample, exportedAt: roundTripAt });

const updated = readBackup(JSON.stringify({
  ...sample,
  photos: {},
  reports: [],
  coupleMessages: [],
  settings: { ...sample.settings, deepSeekApiKey: "synthetic", qwenApiKey: "synthetic", serperApiKey: "synthetic" },
  extension: { example: [1, "示例A"] }
}));
const updatedExport = JSON.parse(exportBackup(updated, roundTripAt));
assert.deepEqual(updatedExport.photos, {});
assert.deepEqual(updatedExport.reports, []);
assert.deepEqual(updatedExport.coupleMessages, []);
assert.deepEqual(updatedExport.extension, { example: [1, "示例A"] });
for (const field of ["deepSeekApiKey", "qwenApiKey", "serperApiKey"]) {
  assert.equal(updatedExport.settings[field], "");
}

for (const version of [1, 2]) {
  const upgraded = readBackup(JSON.stringify({ version, habits: [], checkIns: [], reports: [] }));
  assert.equal(upgraded.version, 3);
  assert.deepEqual(upgraded.photos, {});
  assert.deepEqual(upgraded.coupleMessages, []);
  assert.equal(upgraded.settings.ownerName, "");
}
assert.throws(() => readBackup(JSON.stringify({ ...sample, version: 4 })));
assert.throws(() => readBackup(JSON.stringify({ ...sample, reports: null })));
assert.throws(() => readBackup("{ broken"));

if (process.argv.includes("--write-sample")) {
  mkdirSync(".expo/evidence", { recursive: true });
  writeFileSync(".expo/evidence/sample-backup.json", JSON.stringify(exampleBackup(), null, 2));
}
console.log(`PASS: ${Object.keys(sample).length} top-level fields; only exportedAt changed in the version 3 sample.`);
console.log("PASS: photos and empty arrays, unknown fields, redaction, version 1/2 upgrade, and invalid input.");
