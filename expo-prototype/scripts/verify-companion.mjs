import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { exportBackup, readBackup, normalizeBackup } from "../lib/backup.ts";
import { allCare, careScore, dayInZone, growthStage, mergeCompanion } from "../lib/companion.ts";
import { companionVoice } from "../lib/companion-voice.ts";
import { exampleBackup } from "../lib/sample.ts";

await mkdir(".expo", { recursive: true });
const directory = await mkdtemp(".expo/companion-check-");
const file = join(directory, "test-store.json");
const reservation = createServer().listen(0, "127.0.0.1");
await once(reservation, "listening");
const { port } = reservation.address();
await new Promise((resolve) => reservation.close(resolve));
const url = `http://127.0.0.1:${port}/api`;
const key = randomBytes(32).toString("hex");
const password = "local-test-account-password";
const spaceId = "garden-test-space";
let child;

async function start() {
  child = spawn(process.execPath, ["../server/index.mjs"], {
    stdio: "ignore",
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port),
      LOVELOG_DATA_FILE: file, LOVELOG_JWT_SECRET: key, LOVELOG_ALLOW_REGISTRATION: "true" }
  });
  for (let attempts = 0; attempts < 80; attempts += 1) {
    if (child.exitCode !== null) throw new Error("Test server exited");
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {}
    await wait(25);
  }
  throw new Error("Test server did not become ready");
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}

async function request(path, body, session, expected = 200) {
  const result = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: JSON.stringify(body)
  });
  assert.equal(result.status, expected, path);
  return result.json();
}

const login = (username, inviteCode, target = spaceId) =>
  request("/auth/login", { username, password, spaceId: target, inviteCode });
const companion = (user, operation, args = {}, expected = 200) =>
  request("/companion", { spaceId, operation, ...args }, user, expected);

try {
  await start();
  const a = await login("example-user-a");
  const outsider = await login("example-outsider", undefined, "garden-other-space");
  assert.equal((await companion(a, "state")).status, "pair-required");
  await companion(outsider, "state", {}, 403);
  const b = await login("example-user-b", a.space.inviteCode);
  const [first, second] = await Promise.all([companion(a, "adopt", { timeZone: "UTC" }), companion(b, "adopt", { timeZone: "UTC" })]);
  assert.equal(first.companion.id, second.companion.id);
  assert.notEqual(first.slot, second.slot);

  // Seed an earlier adoption in the isolated fixture so a second day can be tested without changing the clock.
  await stop();
  const database = JSON.parse(await readFile(file, "utf8"));
  const dayOne = dayInZone("UTC", new Date(Date.now() - 86_400_000));
  const dayTwo = dayInZone("UTC");
  database.records[spaceId].LoveCompanion.current.adoptedDay = dayOne;
  await writeFile(file, JSON.stringify(database));
  await start();

  const record = (user, day, action, args = {}, result = 200) =>
    companion(user, "care", { companionId: first.companion.id, records: [{ day, action }], ...args }, result);
  const [a1, a2] = await Promise.all([
    record(a, dayOne, "feed"), record(a, dayOne, "visit")
  ]);
  assert.equal(a1.companion.records[0].action, a2.companion.records[0].action);
  await record(b, dayOne, "pet", { records: [{ day: dayOne, slot: first.slot, action: "pet" }] });
  const paired = await companion(a, "state");
  const pairedProgress = mergeCompanion(paired.companion);
  assert.equal(careScore(pairedProgress), 3);
  assert.equal(growthStage(3), "初来");
  assert.deepEqual(new Set(paired.companion.records.map((item) => item.slot)), new Set([first.slot, second.slot]));

  const pending = { ...pairedProgress, pending: [{ day: dayTwo, slot: first.slot, action: "visit" }] };
  const fixture = normalizeBackup({ ...exampleBackup(dayTwo), companions: { [spaceId]: pending } });
  const restored = readBackup(exportBackup(fixture));
  assert.deepEqual(restored.companions[spaceId], pending);
  assert.deepEqual(restored.photos, fixture.photos);
  assert.equal(readBackup(exportBackup(normalizeBackup(exampleBackup()))).companions, undefined);
  assert.equal(careScore(restored.companions[spaceId]), 4);

  await record(a, dayTwo, "visit");
  await record(a, dayTwo, "feed");
  await record(a, "2099-01-01", "feed", {}, 400);
  const synced = mergeCompanion((await companion(b, "state")).companion, pending);
  assert.equal(careScore(synced), 4);
  assert.equal(growthStage(careScore(synced)), "亲近");
  assert.equal(allCare(synced).length, 3);
  assert.equal(synced.pending.length, 0);
  assert.equal(growthStage(10), "长大");

  const wish = { id: "example-wish", craving: "示例·热可可", fulfilled: true };
  await request("/sync/push", { spaceId, records: [{ className: "LoveFeedWish", recordId: wish.id, payload: wish }] }, a);
  const oldPull = await request("/sync/pull", { spaceId, cursors: {} }, b);
  assert.equal(oldPull.collections.LoveFeedWish.payloads[0].fulfilled, true);
  assert.equal(oldPull.collections.LoveCompanion, undefined);
  assert.equal(oldPull.collections.LoveCompanionCare, undefined);
  const narrow = await request("/sync/pull", { spaceId, classes: ["LoveFeedWish"] }, b);
  assert.deepEqual(Object.keys(narrow.collections), ["LoveFeedWish"]);

  await login("example-user-c", a.space.inviteCode);
  assert.deepEqual(await companion(a, "state"), { status: "pair-required" });
  assert.deepEqual(await record(b, dayTwo, "pet"), { status: "pair-required" });
  await companion(outsider, "state", {}, 403);
  console.log("PASS: persisted pair slots, concurrent first write, 3/4 points, repeat safety, old backup, old pull, and membership isolation.");
} finally {
  await stop();
}

for (const provider of ["deepseek", "qwen"]) {
  const seen = [];
  const send = async (url, request) => {
    seen.push({ url, body: JSON.parse(request.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: "示例台词" } }] }));
  };
  const result = await companionVoice({ provider, model: "example-model" }, "synthetic-key", "亲近", "visit", send);
  assert.equal(result.text, "示例台词");
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, provider === "deepseek" ? /api\.deepseek\.com/ : /dashscope\.aliyuncs\.com/);
  assert.equal(seen[0].body.model, "example-model");
  assert.deepEqual(seen[0].body.messages.map((item) => item.role), ["system", "user"]);
  assert.match(seen[0].body.messages[1].content, /亲近.*陪一会/s);
  assert.equal((await companionVoice({ provider }, null, "亲近", "visit", send)).source, "本地台词");
  assert.equal(seen.length, 1);
}
console.log("PASS: synthetic DeepSeek and Qwen requests carry the chosen model, stage and action only. A missing key uses a local line.");
