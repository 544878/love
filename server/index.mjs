import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(rootDir, "dist");
const dataFile = resolve(process.env.LOVELOG_DATA_FILE || join(rootDir, "server", "data", "lovelog.json"));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const jwtSecret = process.env.LOVELOG_JWT_SECRET || "";
const allowRegistration = process.env.LOVELOG_ALLOW_REGISTRATION !== "false";
const allowedOrigins = new Set((process.env.LOVELOG_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
const tokenLifetimeSeconds = 60 * 60 * 24 * 30;

const classPermissions = {
  LoveHabit: [true, true],
  LoveCheckIn: [true, true],
  LoveDailyReport: [true, true],
  LoveStudySession: [true, true],
  LoveDailyBrief: [true, true],
  LoveAutomationRule: [true, true],
  LoveAutomationRun: [true, true],
  LoveKnowledgeFile: [true, true],
  LoveAgentConversation: [true, true],
  LoveCouplePost: [true, true],
  LoveFeedWish: [true, true],
  LoveSharedCourse: [true, true],
  LoveCoupleEvent: [true, true],
  LoveTodo: [true, true],
  LoveChatMessage: [true, true],
  LoveStudyMetric: [true, true],
  LoveWordLearningRecord: [true, true],
  LoveStudyStat: [true, true],
  LoveTaskTemplate: [true, true],
  LoveDailyTaskRecord: [true, true],
  LoveBadgeGift: [true, true]
};

let database;
let writeQueue = Promise.resolve();

function emptyDatabase() {
  return { version: 1, users: {}, spaces: {}, records: {}, photos: {} };
}

async function loadDatabase() {
  try {
    const loaded = { ...emptyDatabase(), ...JSON.parse(await readFile(dataFile, "utf8")) };
    for (const space of Object.values(loaded.spaces || {})) {
      for (const userId of Object.keys(space.members || {})) space.members[userId] = "member";
    }
    return loaded;
  } catch (error) {
    if (error?.code === "ENOENT") return emptyDatabase();
    throw error;
  }
}

async function saveDatabase() {
  const contents = JSON.stringify(database, null, 2);
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.tmp`;
    await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, dataFile);
  });
  return writeQueue;
}

function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds
  })).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return undefined;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return undefined;
  const expected = createHmac("sha256", jwtSecret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return decoded.exp > Date.now() / 1000 ? decoded.sub : undefined;
}

function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function passwordMatches(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function safeSpaceId(value, username) {
  const requested = String(value || "").trim();
  if (requested && /^[a-zA-Z0-9_-]{3,64}$/.test(requested)) return requested;
  const slug = username.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 40) || "love";
  return `${slug}-${randomBytes(3).toString("hex")}`;
}

function membership(spaceId, userId) {
  return database.spaces[spaceId]?.members?.[userId];
}

function publicSpace(space, userId) {
  return { id: space.id, role: "member", inviteCode: space.inviteCode };
}

function createSpace(spaceId, userId) {
  const now = new Date().toISOString();
  const space = {
    id: spaceId,
    name: "LoveLog",
    inviteCode: randomBytes(6).toString("base64url"),
    members: { [userId]: "member" },
    createdAt: now,
    updatedAt: now
  };
  database.spaces[spaceId] = space;
  return space;
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin || (allowedOrigins.size && !allowedOrigins.has(origin))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  };
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw Object.assign(new Error("请求内容过大"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function authenticate(request) {
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const userId = verifyToken(token);
  const user = userId ? database.users[userId] : undefined;
  if (!user) throw Object.assign(new Error("登录已失效，请重新登录"), { statusCode: 401 });
  return user;
}

function requireSpace(user, spaceId) {
  const space = database.spaces[spaceId];
  const role = membership(spaceId, user.id);
  if (!space || !role) throw Object.assign(new Error("无权访问此共享空间"), { statusCode: 403 });
  return { space, role };
}

async function handleLogin(request, response, headers) {
  const body = await readJson(request);
  const username = cleanUsername(body.username);
  const password = String(body.password || "");
  if (username.length < 3 || password.length < 8) {
    return sendJson(response, 400, { error: "用户名至少 3 位，密码至少 8 位" }, headers);
  }
  const userId = createHash("sha256").update(username).digest("hex").slice(0, 24);
  let user = database.users[userId];
  if (!user) {
    if (!allowRegistration) return sendJson(response, 403, { error: "服务器已关闭新账号注册" }, headers);
    user = { id: userId, username, passwordHash: passwordHash(password), createdAt: new Date().toISOString() };
    database.users[userId] = user;
  } else if (!passwordMatches(password, user.passwordHash)) {
    return sendJson(response, 401, { error: "用户名或密码错误" }, headers);
  }

  const spaceId = safeSpaceId(body.spaceId, username);
  let space = database.spaces[spaceId];
  if (!space) {
    if (body.inviteCode) {
      return sendJson(response, 400, { error: "共享空间不存在，请填写 owner 提供的邀请码" }, headers);
    }
    space = createSpace(spaceId, userId);
  } else if (!membership(spaceId, userId)) {
    if (!body.inviteCode || body.inviteCode !== space.inviteCode) {
      return sendJson(response, 403, { error: "共享空间邀请码不正确" }, headers);
    }
    space.members[userId] = "member";
    space.updatedAt = new Date().toISOString();
  }
  await saveDatabase();
  sendJson(response, 200, {
    token: signToken(userId),
    user: { username: user.username },
    space: publicSpace(space, userId)
  }, headers);
}

async function handlePush(request, response, headers, user) {
  const body = await readJson(request);
  const spaceId = String(body.spaceId || "");
  const { role } = requireSpace(user, spaceId);
  const records = Array.isArray(body.records) ? body.records : [];
  const now = new Date().toISOString();
  database.records[spaceId] ||= {};
  let saved = 0;
  for (const item of records) {
    const permission = classPermissions[item.className];
    if (!permission || !permission[1]) continue;
    const recordId = String(item.recordId || "");
    if (!recordId) continue;
    database.records[spaceId][item.className] ||= {};
    database.records[spaceId][item.className][recordId] = {
      id: recordId,
      payload: {
        ...item.payload,
        spaceId,
        createdBy: item.payload?.createdBy || user.id,
        updatedAtIso: now,
        deletedAtIso: item.deletedAtIso,
        revision: Number(item.payload?.revision || 0) + 1
      },
      updatedAtIso: now
    };
    saved += 1;
  }
  database.spaces[spaceId].updatedAt = now;
  await saveDatabase();
  sendJson(response, 200, { saved, syncedAt: now }, headers);
}

async function handlePull(request, response, headers, user) {
  const body = await readJson(request);
  const spaceId = String(body.spaceId || "");
  const { role } = requireSpace(user, spaceId);
  const cursors = body.cursors && typeof body.cursors === "object" ? body.cursors : {};
  const collections = {};
  const spaceRecords = database.records[spaceId] || {};
  for (const [className, permission] of Object.entries(classPermissions)) {
    if (!permission[0]) continue;
    const since = String(cursors[className] || "");
    const records = Object.values(spaceRecords[className] || {})
      .filter((item) => !since || item.updatedAtIso > since)
      .sort((left, right) => left.updatedAtIso.localeCompare(right.updatedAtIso));
    collections[className] = {
      payloads: records.map((item) => item.payload),
      latest: records.at(-1)?.updatedAtIso || since || undefined
    };
  }
  sendJson(response, 200, { collections }, headers);
}

async function handlePhotoUpload(request, response, headers, user) {
  const body = await readJson(request);
  const spaceId = String(body.spaceId || "");
  requireSpace(user, spaceId);
  const id = String(body.id || "");
  const dataUrl = String(body.dataUrl || "");
  if (!id || !dataUrl.startsWith("data:image/")) {
    return sendJson(response, 400, { error: "照片数据无效" }, headers);
  }
  database.photos[spaceId] ||= {};
  database.photos[spaceId][id] = { dataUrl, updatedAt: new Date().toISOString(), createdBy: user.id };
  await saveDatabase();
  sendJson(response, 200, { saved: true }, headers);
}

function handlePhotoRead(request, response, headers, user, url) {
  const id = decodeURIComponent(url.pathname.slice("/api/photos/".length));
  const spaceId = url.searchParams.get("spaceId") || "";
  requireSpace(user, spaceId);
  const photo = database.photos[spaceId]?.[id];
  sendJson(response, photo ? 200 : 404, photo ? { dataUrl: photo.dataUrl } : { error: "照片不存在" }, headers);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

async function serveWeb(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(distDir, requested);
  const safeCandidate = candidate === distDir || candidate.startsWith(`${distDir}${sep}`);
  try {
    const info = safeCandidate ? await stat(candidate) : undefined;
    const file = info?.isFile() ? candidate : join(distDir, "index.html");
    const contents = await readFile(file);
    response.writeHead(200, { "Content-Type": contentTypes[extname(file)] || "application/octet-stream" });
    response.end(contents);
  } catch {
    sendJson(response, 503, { error: "网页尚未构建，请先运行 npm run build" });
  }
}

database = await loadDatabase();
if (!jwtSecret || jwtSecret.length < 32) {
  console.error("LOVELOG_JWT_SECRET must contain at least 32 characters.");
  process.exit(1);
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    return response.end();
  }
  try {
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      return await handleLogin(request, response, headers);
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true }, headers);
    }
    if (url.pathname.startsWith("/api/")) {
      const user = authenticate(request);
      if (request.method === "POST" && url.pathname === "/api/auth/logout") return sendJson(response, 200, { ok: true }, headers);
      if (request.method === "POST" && url.pathname === "/api/spaces/ensure") {
        const body = await readJson(request);
        const { space } = requireSpace(user, String(body.spaceId || ""));
        return sendJson(response, 200, { space: publicSpace(space, user.id) }, headers);
      }
      if (request.method === "POST" && url.pathname === "/api/sync/push") return await handlePush(request, response, headers, user);
      if (request.method === "POST" && url.pathname === "/api/sync/pull") return await handlePull(request, response, headers, user);
      if (request.method === "POST" && url.pathname === "/api/photos") return await handlePhotoUpload(request, response, headers, user);
      if (request.method === "GET" && url.pathname.startsWith("/api/photos/")) return handlePhotoRead(request, response, headers, user, url);
      return sendJson(response, 404, { error: "接口不存在" }, headers);
    }
    return await serveWeb(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, error?.statusCode || 500, { error: error?.message || "服务器内部错误" }, headers);
  }
}).listen(port, host, () => {
  console.log(`LoveLog web and API server listening on http://${host}:${port}`);
});
