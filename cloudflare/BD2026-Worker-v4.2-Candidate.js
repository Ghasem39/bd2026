// BD2026 Cloudflare Worker — نسخه ۴.۱ (اصلاح‌شده از نسخه ۴)
// - ورود کاربران قدیمی: هش خام Base64 (PBKDF2-SHA256، ۲۱۰٬۰۰۰ تکرار) قابل تأیید است و پس از ورود موفق به قالب جدید ارتقا می‌یابد.
// - PBKDF2 با پیاده‌سازی SHA-256 در JavaScript انجام می‌شود، چون Web Crypto در Workers بیش از ۱۰۰٬۰۰۰ تکرار را نمی‌پذیرد.
// - مهاجرت خودکار، idempotent و غیرمخرب؛ هیچ DROP یا حذف داده‌ای وجود ندارد.
// - مهاجرت pro_subscriptions با نگاشت امن کدهای قدیمی؛ خطای یک بخش، سایر APIها را از کار نمی‌اندازد.
// - پرداخت زرین‌پال: ثبت رکورد پیش از ایجاد درخواست، تأیید سمت سرور، ثبت اتمیک، و بازیابی با Cron.
// - Follow حذف شده؛ تعامل مالی تا تعرفه‌ی تأییدشده و تأیید واقعی بسته می‌ماند.

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const SECURITY_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
const SESSION_DAYS = 30;
const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const LEGACY_PASSWORD_ITERATIONS = 210000; // قالب خام قبلی: Base64 بدون پیشوند
const PASSWORD_ITERATIONS = 210000; // هش‌های جدید؛ کاهش نیافته است
const PASSWORD_MAX_ITERATIONS = 1000000; // سقف پذیرش هنگام خواندن هش (ضد DoS)
const WELCOME_COINS = 500;
const DAILY_FREE_CAMPAIGN_LIMIT = 5;
const AUTH_WINDOW_MAX = 12;
const BODY_LIMIT_BYTES = 16384;
const CONTENT_URL_MAX_LENGTH = 2048;
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const SCHEMA_RETRY_MS = 30000;
const MIGRATION_MARKER = "v4.2-complete";
const LEGACY_PRO_BACKUP = "pro_subscriptions_legacy_003";
const DEFAULT_FRONTEND_URL = "https://bd2026.ir";
const FRONTEND_URLS = new Set(["https://bd2026.ir", "https://www.bd2026.ir"]);
const ZARINPAL_PRODUCTION = Object.freeze({ api: "https://payment.zarinpal.com", pay: "https://www.zarinpal.com" });
const ZARINPAL_SANDBOX = Object.freeze({ api: "https://sandbox.zarinpal.com", pay: "https://sandbox.zarinpal.com" });
const PRO_PLANS = Object.freeze([
  { code: "monthly", title: "ماهانه", duration_months: 1, coins: 8000, amount_rial: 2000000 },
  { code: "quarterly", title: "سه‌ماهه", duration_months: 3, coins: 26000, amount_rial: 5400000, saving_percent: 10 },
  { code: "half_year", title: "شش‌ماهه", duration_months: 6, coins: 56000, amount_rial: 10200000, saving_percent: 15 },
]);
const PRO_PLAN_BY_CODE = new Map(PRO_PLANS.map((plan) => [plan.code, plan]));
const ALLOWED_ORIGINS = new Set(["https://bd2026.ir", "https://www.bd2026.ir", "https://ghasem39.github.io", "https://db2026-12.pages.dev"]);
const ALLOWED_GOALS = new Set(["views", "likes", "shares", "subs"]);
const ALLOWED_PLATFORMS = new Set(["instagram", "youtube", "aparat"]);
const DUMMY_PASSWORD_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORITY_RE = /^[A-Za-z0-9]{8,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- ساختار دیتابیس (idempotent) ----------
const PRO_SUBSCRIPTIONS_COLUMNS = `(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_code TEXT NOT NULL CHECK(plan_code IN ('monthly','quarterly','half_year')), status TEXT NOT NULL CHECK(status IN ('pending','active','expired','cancelled','refunded')), starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, payment_reference TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(expires_at > starts_at))`;
const BASE_TABLES = [
  `CREATE TABLE IF NOT EXISTS bd2026_schema_log (id TEXT PRIMARY KEY, note TEXT, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (id TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, platform TEXT NOT NULL, content_url TEXT NOT NULL, title TEXT, objective TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_review', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS wallet_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL, transaction_type TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS wallet_ledger_conflicts (ledger_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL, user_id TEXT NOT NULL, amount INTEGER NOT NULL, transaction_type TEXT NOT NULL, created_at TEXT, detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS interaction_costs (interaction_type TEXT PRIMARY KEY, cost_coins INTEGER NOT NULL CHECK(cost_coins > 0), is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS campaign_interactions (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, participant_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, interaction_type TEXT NOT NULL CHECK(interaction_type IN ('views','likes','shares','subs')), cost_coins INTEGER NOT NULL CHECK(cost_coins > 0), ledger_entry_id TEXT NOT NULL UNIQUE REFERENCES wallet_ledger(id), idempotency_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'settled' CHECK(status IN ('pending','settled','reversed')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(participant_user_id, idempotency_key))`,
  `CREATE TABLE IF NOT EXISTS video_watch_rewards (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL, content_url TEXT NOT NULL, watched_seconds INTEGER NOT NULL CHECK(watched_seconds BETWEEN 1 AND 180), reward_coins INTEGER NOT NULL CHECK(reward_coins >= 0), verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','rejected')), idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, idempotency_key))`,
  `CREATE TABLE IF NOT EXISTS pro_subscriptions ${PRO_SUBSCRIPTIONS_COLUMNS}`,
  `CREATE TABLE IF NOT EXISTS pro_payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_code TEXT NOT NULL CHECK(plan_code IN ('monthly','quarterly','half_year')), amount_rial INTEGER NOT NULL CHECK(amount_rial > 0), coins INTEGER NOT NULL CHECK(coins > 0), provider TEXT NOT NULL DEFAULT 'zarinpal', authority TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('initiating','pending','verifying','verified','failed','cancelled','expired','needs_review')), ref_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, verified_at TEXT)`,
];
// ستون‌هایی که در نسخه‌های قدیمی وجود نداشتند؛ فقط افزوده می‌شوند.
const ADDITIVE_COLUMNS = {
  campaigns: [["title", "TEXT"], ["goals_json", "TEXT NOT NULL DEFAULT '[]'"], ["status", "TEXT NOT NULL DEFAULT 'pending_review'"]],
  wallet_ledger: [["description", "TEXT"], ["idempotency_key", "TEXT"], ["reference_type", "TEXT"], ["reference_id", "TEXT"]],
};
// ستون‌هایی که کد به آن‌ها تکیه دارد؛ کمبود هر کدام فقط قابلیت وابسته را غیرفعال می‌کند.
const REQUIRED_COLUMNS = {
  users: ["id", "name", "email", "password_hash", "password_salt", "created_at"],
  sessions: ["id", "user_id", "token_hash", "expires_at"],
  auth_attempts: ["id", "ip_hash", "attempted_at"],
  campaigns: ["id", "user_id", "platform", "content_url", "title", "objective", "goals_json", "status", "created_at"],
  wallet_ledger: ["id", "user_id", "amount", "transaction_type", "description", "idempotency_key", "reference_type", "reference_id", "created_at"],
  wallet_ledger_conflicts: ["ledger_id", "idempotency_key", "user_id", "amount", "transaction_type", "detected_at"],
  pro_subscriptions: ["id", "user_id", "plan_code", "status", "starts_at", "expires_at", "payment_reference", "created_at"],
  pro_payments: ["id", "user_id", "plan_code", "amount_rial", "coins", "authority", "status", "ref_id", "created_at", "updated_at", "verified_at"],
};

const schemaByDb = new WeakMap();

// یک اجرای مهاجرت در هر نمونه کافی است؛ خطا هرگز پرتاب نمی‌شود و گزارش برمی‌گردد.
function ensureSchema(db) {
  const existing = schemaByDb.get(db);
  if (existing && (existing.done || Date.now() < existing.expires)) return existing.promise;
  const entry = { done: false, expires: Infinity, promise: null };
  entry.promise = runSchemaMigration(db).then(
    (report) => { entry.done = report.complete; entry.expires = Date.now() + SCHEMA_RETRY_MS; return report; },
    () => { entry.expires = Date.now() + SCHEMA_RETRY_MS; return unavailableReport(["unexpected_error"]); },
  );
  schemaByDb.set(db, entry);
  return entry.promise;
}
function unavailableReport(failures = []) {
  return { complete: false, fast_path: false, capabilities: { core: false, wallet: false, campaigns: false, pro: false }, applied: [], warnings: [], failures, missing: [] };
}
async function columnsOf(db, table) {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set((rows.results || []).map((row) => row.name));
}
async function tryStep(report, name, fn) {
  try {
    await fn();
  } catch (err) {
    const message = String(err?.message || "");
    console.error(`schema step failed: ${name}`);
    report.failures.push(message.startsWith("schema mismatch:") ? message : name);
  }
}

async function runSchemaMigration(db) {
  const report = unavailableReport();
  try {
    const marker = await db.prepare("SELECT id FROM bd2026_schema_log WHERE id = ?").bind(MIGRATION_MARKER).first();
    if (marker) {
      const fastReport = { ...report, fast_path: true };
      await checkCapabilities(db, fastReport);
      fastReport.complete = fastReport.capabilities.core && fastReport.capabilities.wallet && fastReport.capabilities.campaigns && fastReport.capabilities.pro;
      if (fastReport.complete) return fastReport;
      // نشان مهاجرت به‌تنهایی کافی نیست؛ اگر ساختار بعداً ناقص شده باشد، مسیر ترمیم اجرا می‌شود.
      report.warnings.push("schema marker exists but required capabilities are incomplete; repair migration will run");
    }
  } catch {
    // جدول لاگ یا بخشی از ساختار هنوز نیست؛ مهاجرت کامل اجرا می‌شود.
  }
  try {
    for (const sql of BASE_TABLES) await db.prepare(sql).run();
  } catch {
    console.error("schema step failed: base_tables");
    report.failures.push("base_tables");
    return report;
  }
  await tryStep(report, "pro_subscriptions_v4", () => migrateProSubscriptions(db, report));
  await tryStep(report, "additive_columns", () => addMissingColumns(db, report));
  await tryStep(report, "wallet_idempotency", () => migrateWalletIdempotency(db, report));
  await tryStep(report, "indexes", () => createIndexes(db));
  await tryStep(report, "users_email_unique", () => migrateEmailIndex(db, report));
  await tryStep(report, "capability_check", () => checkCapabilities(db, report));
  report.complete = report.failures.length === 0 && report.capabilities.core && report.capabilities.wallet && report.capabilities.campaigns && report.capabilities.pro;
  if (report.complete) await db.prepare("INSERT OR IGNORE INTO bd2026_schema_log (id, note) VALUES (?, 'ok')").bind(MIGRATION_MARKER).run();
  return report;
}

const PRO_COPY_FROM = (source) => `INSERT INTO pro_subscriptions (id, user_id, plan_code, status, starts_at, expires_at, payment_reference, created_at)
  SELECT id, user_id, CASE plan_code WHEN 'pro_monthly' THEN 'monthly' WHEN 'pro_quarterly' THEN 'quarterly' WHEN 'pro_semiannual' THEN 'half_year' END,
         status, starts_at, expires_at, payment_reference, created_at
  FROM ${source} WHERE user_id IN (SELECT id FROM users) AND NOT EXISTS (SELECT 1 FROM pro_subscriptions s WHERE s.id = ${source}.id)`;
// ردیف بی‌کاربر (یتیم) کپی نمی‌شود، اما در جدول پشتیبان دست‌نخورده می‌ماند و شمارش آن هشدار می‌شود.
async function reportOrphanProRows(db, report) {
  const orphan = await db.prepare(`SELECT COUNT(*) AS n FROM ${LEGACY_PRO_BACKUP} WHERE user_id NOT IN (SELECT id FROM users)`).first().catch(() => null);
  if (orphan?.n > 0) report.warnings.push(`pro_subscriptions: ${orphan.n} legacy row(s) without a matching user kept untouched in ${LEGACY_PRO_BACKUP}`);
}

// نگاشت امن کدهای قدیمی: pro_monthly→monthly، pro_quarterly→quarterly، pro_semiannual→half_year.
// جدول قدیمی حذف نمی‌شود؛ به نام پشتیبان تغییر نام می‌یابد و کپی با شناسه‌ی یکتا تکرارپذیر است.
async function migrateProSubscriptions(db, report) {
  const current = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pro_subscriptions'").first();
  const currentSql = current?.sql || "";
  const backupExists = Boolean(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").bind(LEGACY_PRO_BACKUP).first());
  if (/'pro_monthly'/.test(currentSql)) {
    if (backupExists) throw new Error(`schema mismatch: ${LEGACY_PRO_BACKUP} already exists while pro_subscriptions is legacy; left untouched`);
    const count = await db.prepare("SELECT COUNT(*) AS n FROM pro_subscriptions").first();
    await db.batch([
      db.prepare(`ALTER TABLE pro_subscriptions RENAME TO ${LEGACY_PRO_BACKUP}`),
      db.prepare(`CREATE TABLE pro_subscriptions ${PRO_SUBSCRIPTIONS_COLUMNS}`),
      db.prepare(PRO_COPY_FROM(LEGACY_PRO_BACKUP)),
      db.prepare("CREATE INDEX IF NOT EXISTS pro_subs_v4_user_status_idx ON pro_subscriptions(user_id, status, expires_at)"),
    ]);
    report.applied.push(`pro_subscriptions: ${count?.n || 0} legacy row(s) copied with plan mapping; original kept as ${LEGACY_PRO_BACKUP}`);
    await reportOrphanProRows(db, report);
    return;
  }
  if (!/'half_year'/.test(currentSql)) throw new Error("schema mismatch: pro_subscriptions has an unrecognized shape; left untouched");
  if (backupExists) {
    await db.batch([db.prepare(PRO_COPY_FROM(LEGACY_PRO_BACKUP))]);
    await reportOrphanProRows(db, report);
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS pro_subs_v4_user_status_idx ON pro_subscriptions(user_id, status, expires_at)").run();
}

async function addMissingColumns(db, report) {
  for (const [table, columns] of Object.entries(ADDITIVE_COLUMNS)) {
    for (const [name, definition] of columns) {
      if ((await columnsOf(db, table)).has(name)) continue;
      try {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
        report.applied.push(`${table}.${name}`);
      } catch (err) {
        if (!(await columnsOf(db, table)).has(name)) throw err; // اجرای هم‌زمان نمونه‌ی دیگر
      }
    }
  }
}

// کلیدهای تکراری قدیمی هرگز حذف یا بازنویسی نمی‌شوند؛ فقط در جدول گزارش ثبت می‌شوند.
// در این حالت ایندکس یکتا ساخته نمی‌شود و درج‌ها با شرط NOT EXISTS محافظت می‌شوند.
const DUPLICATE_KEYS_SQL = "SELECT idempotency_key FROM wallet_ledger WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING COUNT(*) > 1";
async function migrateWalletIdempotency(db, report) {
  const dup = await db.prepare(`SELECT COUNT(*) AS n FROM (${DUPLICATE_KEYS_SQL})`).first();
  const duplicateKeys = dup?.n || 0;
  if (duplicateKeys > 0) {
    await db.prepare(`INSERT OR IGNORE INTO wallet_ledger_conflicts (ledger_id, idempotency_key, user_id, amount, transaction_type, created_at, detected_at)
      SELECT id, idempotency_key, user_id, amount, transaction_type, created_at, CURRENT_TIMESTAMP FROM wallet_ledger
      WHERE idempotency_key IN (${DUPLICATE_KEYS_SQL})`).run();
    report.warnings.push(`wallet_ledger: ${duplicateKeys} duplicate idempotency key(s) recorded in wallet_ledger_conflicts; no rows changed, unique index not created`);
    return;
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_unique ON wallet_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL").run();
}

async function createIndexes(db) {
  const statements = [
    "CREATE INDEX IF NOT EXISTS campaigns_user_created_idx ON campaigns(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS auth_attempts_ip_time_idx ON auth_attempts(ip_hash, attempted_at)",
    "CREATE INDEX IF NOT EXISTS pro_payments_user_idx ON pro_payments(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS campaign_interactions_campaign_idx ON campaign_interactions(campaign_id, created_at)",
    "CREATE INDEX IF NOT EXISTS campaign_interactions_participant_idx ON campaign_interactions(participant_user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS video_watch_rewards_user_idx ON video_watch_rewards(user_id, created_at)",
  ];
  for (const sql of statements) await db.prepare(sql).run();
}

async function migrateEmailIndex(db, report) {
  const dup = await db.prepare("SELECT COUNT(*) AS n FROM (SELECT lower(email) FROM users GROUP BY lower(email) HAVING COUNT(*) > 1)").first();
  if ((dup?.n || 0) > 0) report.warnings.push("users_email_lower_unique: skipped, duplicate emails exist; resolve manually");
  else await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users(lower(email))").run();
}

async function checkCapabilities(db, report) {
  const cols = {};
  for (const table of Object.keys(REQUIRED_COLUMNS)) {
    cols[table] = await columnsOf(db, table);
    const missing = REQUIRED_COLUMNS[table].filter((name) => !cols[table].has(name));
    if (missing.length) report.missing.push(`${table}: ${missing.join(",")}`);
  }
  const shapes = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('pro_subscriptions','pro_payments')").all();
  const sqlOf = Object.fromEntries((shapes.results || []).map((r) => [r.name, r.sql || ""]));
  const ok = (table) => REQUIRED_COLUMNS[table].every((name) => cols[table].has(name));
  const core = ok("users") && ok("sessions") && ok("auth_attempts");
  report.capabilities = {
    core,
    wallet: core && ok("wallet_ledger") && ok("wallet_ledger_conflicts"),
    campaigns: core && ok("campaigns"),
    pro: core && ok("pro_subscriptions") && ok("pro_payments") && /'half_year'/.test(sqlOf.pro_subscriptions || "") && /'initiating'/.test(sqlOf.pro_payments || ""),
  };
}

// ---------- ابزارهای عمومی ----------
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function corsHeaders(origin) {
  const h = { "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, Authorization", "access-control-max-age": "86400", vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
function randomHex(bytes = 32) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function fromBase64(value) { const s = atob(value); return Uint8Array.from(s, (c) => c.charCodeAt(0)); }
async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isUniqueViolation(err) { return /UNIQUE constraint failed/i.test(String(err?.message || err)); }
export function tehranDayStartSql(now = Date.now()) {
  const shifted = now + TEHRAN_OFFSET_MS;
  const startShifted = Math.floor(shifted / 86400000) * 86400000;
  return new Date(startShifted - TEHRAN_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}
function sqlTime(ms) { return new Date(ms).toISOString().slice(0, 19).replace("T", " "); }
function nowSql() { return sqlTime(Date.now()); }
function getBearer(request) {
  const m = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
function safeUser(row) { return { id: row.id, name: row.name, email: row.email, created_at: row.created_at }; }
function zarinpalEndpoints(env) { return env.ZARINPAL_SANDBOX === "true" ? ZARINPAL_SANDBOX : ZARINPAL_PRODUCTION; }
function publicApiBase(request, env) {
  const configured = typeof env.PUBLIC_API_URL === "string" ? env.PUBLIC_API_URL.trim().replace(/\/+$/, "") : "";
  if (/^https:\/\/[^/]+$/i.test(configured)) return configured;
  return new URL(request.url).origin;
}
function frontendBase(env) {
  const configured = typeof env.FRONTEND_URL === "string" ? env.FRONTEND_URL.trim().replace(/\/+$/, "") : "";
  return FRONTEND_URLS.has(configured) ? configured : DEFAULT_FRONTEND_URL;
}
function redirectTo(location) {
  return new Response(null, { status: 302, headers: { location } });
}

// ---------- PBKDF2 از Web Crypto بومی Cloudflare Workers ----------
// از پیاده‌سازی سنگین JavaScript استفاده نمی‌کنیم؛ Web Crypto برای عملیات رمزنگاری CPU-intensive
// بهینه‌تر است و PBKDF2-HMAC-SHA-256 را به‌صورت رسمی پشتیبانی می‌کند.
async function derivePasswordB64(password, saltB64, iterations) {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > PASSWORD_MAX_ITERATIONS) {
    throw new TypeError("invalid PBKDF2 iteration count");
  }
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(saltB64), iterations, hash: "SHA-256" },
    material,
    256,
  );
  return toBase64(new Uint8Array(bits));
}
async function makeStoredPassword(password, saltB64) {
  const hash = await derivePasswordB64(password, saltB64, PASSWORD_ITERATIONS);
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_ITERATIONS}$${hash}`;
}
// قالب جدید: pbkdf2-sha256$iterations$hash ؛ قالب قدیمی: فقط hash در Base64 با ۲۱۰٬۰۰۰ تکرار.
function parseStoredPassword(stored) {
  if (typeof stored !== "string" || stored.length > 200) return null;
  const m = /^pbkdf2-sha256\$(\d{1,7})\$([A-Za-z0-9+/]{43}=)$/.exec(stored);
  if (m) {
    const iterations = Number(m[1]);
    if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > PASSWORD_MAX_ITERATIONS) return null;
    return { format: "current", iterations, hash: m[2] };
  }
  if (/^[A-Za-z0-9+/]{43}=$/.test(stored)) return { format: "legacy", iterations: LEGACY_PASSWORD_ITERATIONS, hash: stored };
  return null;
}

// ---------- نشست، ورود و محدودیت تلاش ----------
async function requireUser(db, request, env) {
  const token = getBearer(request);
  if (!token) return null;
  const tokenHash = await hmacHex(env.SESSION_SECRET, token);
  return await db.prepare("SELECT users.id, users.name, users.email, users.created_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
}
async function allowAuthAttempt(db, env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const hash = await hmacHex(env.SESSION_SECRET, ip);
  await db.prepare("DELETE FROM auth_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
  const result = await db.prepare("INSERT INTO auth_attempts (id, ip_hash, attempted_at) SELECT ?, ?, CURRENT_TIMESTAMP WHERE (SELECT COUNT(*) FROM auth_attempts WHERE ip_hash = ? AND attempted_at >= datetime('now', '-15 minutes')) < ?")
    .bind(crypto.randomUUID(), hash, hash, AUTH_WINDOW_MAX).run();
  return result.meta?.changes > 0;
}
async function createSession(db, env, userId) {
  const token = randomHex(32);
  const tokenHash = await hmacHex(env.SESSION_SECRET, token);
  await db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', ?))").bind(crypto.randomUUID(), userId, tokenHash, `+${SESSION_DAYS} days`).run();
  return token;
}
async function readJson(request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > BODY_LIMIT_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > BODY_LIMIT_BYTES) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

// ---------- اعتبارسنجی لینک محتوا ----------
function validContentUrl(platform, raw) {
  if (typeof raw !== "string" || raw.length > CONTENT_URL_MAX_LENGTH) return false;
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (platform === "instagram") return host === "instagram.com" && /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/i.test(u.pathname);
  if (platform === "youtube") {
    if (host === "youtu.be") return /^\/[A-Za-z0-9_-]{6,}\/?$/.test(u.pathname);
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    if (/^\/(shorts|live)\/[A-Za-z0-9_-]{6,}\/?$/i.test(u.pathname)) return true;
    return u.pathname === "/watch" && /^[A-Za-z0-9_-]{6,}$/.test(u.searchParams.get("v") || "");
  }
  if (platform === "aparat") return host === "aparat.com" && /^\/v\/[A-Za-z0-9_-]+\/?$/i.test(u.pathname);
  return false;
}
function parseGoals(text) {
  try { const v = JSON.parse(text || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ---------- پرداخت زرین‌پال ----------
async function requestZarinpalPayment(env, request, plan, description) {
  const endpoints = zarinpalEndpoints(env);
  const callbackUrl = `${publicApiBase(request, env)}/api/pro/zarinpal/callback`;
  const res = await fetch(`${endpoints.api}/pg/v4/payment/request.json`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ merchant_id: env.ZARINPAL_MERCHANT_ID, amount: plan.amount_rial, currency: "IRR", description, callback_url: callbackUrl }),
  });
  return await res.json().catch(() => null);
}
async function verifyZarinpalPayment(env, authority, amountRial) {
  const endpoints = zarinpalEndpoints(env);
  const res = await fetch(`${endpoints.api}/pg/v4/payment/verify.json`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ merchant_id: env.ZARINPAL_MERCHANT_ID, amount: amountRial, authority }),
  });
  if (res.status >= 500) throw new Error("zarinpal temporarily unavailable");
  return await res.json();
}
// فعال‌سازی اشتراک و کوین در یک تراکنش D1؛ هر دو درج با شرط NOT EXISTS تکرارپذیرند.
async function activateProAfterVerification(db, row, plan, refId) {
  const current = await db.prepare("SELECT MAX(expires_at) AS end_at FROM pro_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > CURRENT_TIMESTAMP").bind(row.user_id).first();
  const startAt = current?.end_at || nowSql();
  const ledgerKey = `pro_payment:${row.authority}`;
  await db.batch([
    db.prepare(`INSERT INTO pro_subscriptions (id, user_id, plan_code, status, starts_at, expires_at, payment_reference)
      SELECT ?, ?, ?, 'active', ?, datetime(?, ?), ?
      WHERE NOT EXISTS (SELECT 1 FROM pro_subscriptions WHERE payment_reference = ?)`)
      .bind(crypto.randomUUID(), row.user_id, plan.code, startAt, startAt, `+${plan.duration_months} months`, row.authority, row.authority),
    db.prepare(`INSERT INTO wallet_ledger (id, user_id, amount, transaction_type, description, idempotency_key, reference_type, reference_id)
      SELECT ?, ?, ?, 'pro_coins', ?, ?, 'pro_payment', ?
      WHERE NOT EXISTS (SELECT 1 FROM wallet_ledger WHERE idempotency_key = ?)`)
      .bind(crypto.randomUUID(), row.user_id, plan.coins, `اعتبار بسته ${plan.title} Pro`, ledgerKey, row.id, ledgerKey),
    db.prepare("UPDATE pro_payments SET status = 'verified', ref_id = ?, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(refId, row.id),
  ]);
}
// تأیید و تسویه‌ی یک تراکنش که قبلاً با CAS به وضعیت verifying برده شده است.
// final=true (callback): تأیید ناموفق → failed. final=false (Cron): برگشت به pending تا تلاش بعدی.
async function verifyAndSettle(db, env, row, { final }) {
  let verified;
  try {
    verified = await verifyZarinpalPayment(env, row.authority, row.amount_rial);
  } catch {
    console.error("zarinpal verify transport error");
    await db.prepare("UPDATE pro_payments SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'verifying'").bind(row.id).run();
    return "pending";
  }
  const code = verified?.data?.code;
  if (code !== 100 && code !== 101) {
    const next = final ? "failed" : "pending";
    await db.prepare("UPDATE pro_payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'verifying'").bind(next, row.id).run();
    return next;
  }
  const refId = verified?.data?.ref_id == null ? null : String(verified.data.ref_id);
  const plan = PRO_PLAN_BY_CODE.get(row.plan_code);
  try {
    if (!plan || plan.amount_rial !== row.amount_rial || plan.coins !== row.coins) throw new Error("plan catalog mismatch");
    await activateProAfterVerification(db, row, plan, refId);
    return "verified";
  } catch {
    console.error("pro activation failed after verification; needs review");
    await db.prepare("UPDATE pro_payments SET status = 'needs_review', ref_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'verifying'").bind(refId, row.id).run();
    return "needs_review";
  }
}
function staleCutoff() { return sqlTime(Date.now() - 10 * 60000); }
async function handleZarinpalCallback(db, env, url) {
  const authority = url.searchParams.get("Authority") || "";
  const status = url.searchParams.get("Status") || "";
  const back = (state) => redirectTo(`${frontendBase(env)}/?pro=${state}`);
  if (!AUTHORITY_RE.test(authority)) return back("failed");
  const row = await db.prepare("SELECT id, authority, user_id, plan_code, amount_rial, coins, status, updated_at FROM pro_payments WHERE authority = ?").bind(authority).first();
  if (!row) return back("failed");
  if (row.status === "verified") return back("success");
  const stale = row.status === "verifying" && row.updated_at < staleCutoff();
  const retryable = row.status === "pending" || row.status === "needs_review" || row.status === "expired" || stale;
  if (!retryable) return back(row.status === "verifying" ? "pending" : "failed");
  if (status !== "OK") {
    if (row.status === "pending") await db.prepare("UPDATE pro_payments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(row.id).run();
    return back("cancelled");
  }
  const claim = await db.prepare("UPDATE pro_payments SET status = 'verifying', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ? AND updated_at = ?")
    .bind(row.id, row.status, row.updated_at).run();
  if (!(claim.meta?.changes > 0)) return back("pending");
  const outcome = await verifyAndSettle(db, env, row, { final: true });
  return back(outcome === "verified" ? "success" : outcome === "failed" ? "failed" : "pending");
}
// Cron: پرداخت‌های معلق را دوباره تأیید می‌کند؛ پرداخت تأییدنشده هرگز فعال نمی‌شود.
async function reconcilePendingPayments(env) {
  if (!env.DB || typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) return { skipped: true };
  const schema = await ensureSchema(env.DB);
  if (!schema.capabilities.pro) return { skipped: true, reason: "pro_schema_not_ready" };
  const db = env.DB;
  await db.prepare("UPDATE pro_payments SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND created_at < datetime('now', '-3 days')").run();
  await db.prepare("UPDATE pro_payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE status = 'initiating' AND created_at < datetime('now', '-10 minutes')").run();
  const rows = await db.prepare(`SELECT id, authority, user_id, plan_code, amount_rial, coins, status, updated_at FROM pro_payments
    WHERE (status IN ('pending','needs_review') AND updated_at < datetime('now', '-2 minutes'))
       OR (status = 'verifying' AND updated_at < datetime('now', '-10 minutes'))
    ORDER BY updated_at ASC LIMIT 20`).all();
  let processed = 0;
  for (const row of rows.results || []) {
    const claim = await db.prepare("UPDATE pro_payments SET status = 'verifying', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ? AND updated_at = ?")
      .bind(row.id, row.status, row.updated_at).run();
    if (!(claim.meta?.changes > 0)) continue;
    await verifyAndSettle(db, env, { ...row, status: "verifying" }, { final: false });
    processed++;
  }
  return { skipped: false, processed };
}

// ---------- پیکربندی و سلامت ----------
function configStatus(env) {
  const secret = env.SESSION_SECRET;
  const merchant = env.ZARINPAL_MERCHANT_ID;
  const frontend = typeof env.FRONTEND_URL === "string" ? env.FRONTEND_URL.trim().replace(/\/+$/, "") : "";
  const publicUrl = typeof env.PUBLIC_API_URL === "string" ? env.PUBLIC_API_URL.trim() : "";
  return {
    d1_binding: env.DB ? "present" : "missing",
    session_secret: typeof secret !== "string" || secret.length === 0 ? "missing" : secret.length < 32 ? "too_short" : "ok",
    zarinpal_merchant_id: merchant == null || merchant === "" ? "missing" : UUID_RE.test(String(merchant)) ? "ok" : "invalid_format",
    zarinpal_mode: env.ZARINPAL_SANDBOX === "true" ? "sandbox" : "production",
    public_api_url: /^https:\/\/[^/]+$/i.test(publicUrl) ? "set" : publicUrl ? "invalid_ignored" : "derived_from_request",
    frontend_url: !frontend ? "default" : FRONTEND_URLS.has(frontend) ? "custom_allowed" : "rejected_using_default",
  };
}
// گزارش سلامت فقط وضعیت را نشان می‌دهد؛ هیچ مقدار Secret، کلید یا شناسه‌ی درگاه در خروجی نیست.
async function healthReport(env) {
  const config = configStatus(env);
  const missingRequired = [];
  if (config.d1_binding !== "present") missingRequired.push("DB (D1 binding)");
  if (config.session_secret !== "ok") missingRequired.push("SESSION_SECRET (secret, at least 32 characters)");
  let schema = null;
  let paymentsByStatus = null;
  let walletConflicts = null;
  if (env.DB) {
    schema = await ensureSchema(env.DB);
    try {
      if (schema.capabilities.pro) {
        const rows = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM pro_payments GROUP BY status").all();
        paymentsByStatus = Object.fromEntries((rows.results || []).map((r) => [r.status, r.n]));
      }
      if (schema.capabilities.wallet) {
        const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM wallet_ledger_conflicts").first();
        walletConflicts = c?.n || 0;
      }
    } catch {
      console.error("health counters unavailable");
    }
  }
  const caps = schema?.capabilities ?? { core: false, wallet: false, campaigns: false, pro: false };
  const ready = missingRequired.length === 0 && caps.core && caps.wallet && caps.campaigns;
  return json({
    ok: ready,
    ready_for_trial: ready,
    service: "BD2026 API",
    version: "v4.2",
    database: !env.DB ? "binding_missing" : caps.core ? "connected" : "schema_not_ready",
    capabilities: caps,
    migrations: schema
      ? { complete: schema.complete, fast_path: schema.fast_path, applied: schema.applied || [], warnings: schema.warnings || [], failures: schema.failures || [], missing_columns: schema.missing || [] }
      : { complete: false, failures: ["not_checked"] },
    config,
    pro_checkout: config.zarinpal_merchant_id === "ok" && caps.pro ? "checkout_configured" : "checkout_disabled",
    pro_payments_by_status: paymentsByStatus,
    wallet_conflicts: walletConflicts,
    missing_required: missingRequired,
    time: new Date().toISOString(),
  }, ready ? 200 : 503);
}

// ---------- مسیرهای API ----------
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  if (method === "GET" && (path === "/" || path === "/api/health")) return healthReport(env);
  // تعرفه‌ی Pro عمومی است و به پایگاه داده وابسته نیست.
  if (method === "GET" && path === "/api/pro/plans") {
    return json({ ok: true, currency: "IRR", payment_provider: "zarinpal", plans: PRO_PLANS });
  }

  if (!env.DB) return json({ error: "اتصال پایگاه داده (binding با نام DB) تنظیم نشده است." }, 503);
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) return json({ error: "راز امنیتی SESSION_SECRET تنظیم نشده یا طول آن کمتر از ۳۲ نویسه است." }, 503);
  const db = env.DB;
  const schema = await ensureSchema(db);
  const caps = schema.capabilities;
  if (!caps.core) return json({ error: "ساختار پایگاه داده آماده نیست؛ جزئیات در /api/health ثبت شده است." }, 503);
  const unavailable = (what) => json({ error: `${what} فعلاً در دسترس نیست؛ وضعیت پایگاه داده در /api/health بررسی شود.` }, 503);

  if (method === "POST" && path === "/api/auth/register") {
    if (!caps.wallet) return unavailable("ثبت‌نام");
    const body = await readJson(request);
    if (!body) return json({ error: "اطلاعات ارسالی معتبر نیست." }, 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 80) return json({ error: "نام باید بین ۲ تا ۸۰ نویسه باشد." }, 400);
    if (!EMAIL_RE.test(email) || email.length > 190) return json({ error: "ایمیل معتبر نیست." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "گذرواژه باید بین ۸ تا ۱۲۸ نویسه باشد." }, 400);
    if (!await allowAuthAttempt(db, env, request)) return json({ error: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید." }, 429);
    const exists = await db.prepare("SELECT id FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first();
    if (exists) return json({ error: "این ایمیل قبلاً ثبت شده است؛ وارد حساب شوید." }, 409);
    const id = crypto.randomUUID();
    const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await makeStoredPassword(password, salt);
    const welcomeKey = `welcome:${id}`;
    try {
      // کاربر و هدیه‌ی ۵۰۰ کوینی در یک تراکنش؛ کلید یکتا و شرط NOT EXISTS باعث ثبت یک‌باره‌ی هدیه می‌شود.
      await db.batch([
        db.prepare("INSERT INTO users (id, name, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)").bind(id, name, email, hash, salt),
        db.prepare(`INSERT INTO wallet_ledger (id, user_id, amount, transaction_type, description, idempotency_key, reference_type, reference_id)
          SELECT ?, ?, ?, 'welcome_bonus', 'اعتبار خوش‌آمدگویی', ?, 'user', ?
          WHERE NOT EXISTS (SELECT 1 FROM wallet_ledger WHERE idempotency_key = ?)`)
          .bind(crypto.randomUUID(), id, WELCOME_COINS, welcomeKey, id, welcomeKey),
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) return json({ error: "این ایمیل قبلاً ثبت شده است؛ وارد حساب شوید." }, 409);
      console.error("register transaction failed");
      return json({ error: "ثبت‌نام انجام نشد؛ دوباره تلاش کنید یا با پشتیبانی تماس بگیرید." }, 500);
    }
    const token = await createSession(db, env, id);
    const user = await db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").bind(id).first();
    return json({ ok: true, user: safeUser(user), token, welcome_coins: WELCOME_COINS }, 201);
  }

  if (method === "POST" && path === "/api/auth/login") {
    const body = await readJson(request);
    if (!body) return json({ error: "اطلاعات ارسالی معتبر نیست." }, 400);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!EMAIL_RE.test(email) || email.length > 190 || !password || password.length > 128) return json({ error: "ایمیل یا گذرواژه نادرست است." }, 401);
    if (!await allowAuthAttempt(db, env, request)) return json({ error: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید." }, 429);
    const user = await db.prepare("SELECT id, name, email, password_hash, password_salt, created_at FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first();
    const stored = parseStoredPassword(user?.password_hash);
    // برای کاربر ناشناس هم PBKDF2 اجرا می‌شود تا زمان پاسخ تفاوتی نداشته باشد.
    const candidate = await derivePasswordB64(password, user?.password_salt || DUMMY_PASSWORD_SALT, stored?.iterations ?? PASSWORD_ITERATIONS);
    if (!user || !stored || !constantTimeEqual(candidate, stored.hash)) return json({ error: "ایمیل یا گذرواژه نادرست است." }, 401);
    if (stored.format !== "current" || stored.iterations !== PASSWORD_ITERATIONS) {
      // ارتقای هش فقط پس از ورود موفق؛ اگر ناموفق بود ورود مختل نمی‌شود و حساب دست‌نخورده می‌ماند.
      try {
        const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
        const upgraded = await makeStoredPassword(password, salt);
        await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ? AND password_hash = ?")
          .bind(upgraded, salt, user.id, user.password_hash).run();
      } catch {
        console.error("password upgrade skipped; login kept");
      }
    }
    const token = await createSession(db, env, user.id);
    return json({ ok: true, user: safeUser(user), token });
  }

  if (method === "POST" && path === "/api/auth/logout") {
    const token = getBearer(request);
    if (token) {
      const hash = await hmacHex(env.SESSION_SECRET, token);
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
    }
    return json({ ok: true, message: "خروج انجام شد." });
  }

  if (method === "GET" && path === "/api/auth/me") {
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "برای ادامه وارد حساب شوید." }, 401);
    return json({ ok: true, user: safeUser(user) });
  }

  if (method === "GET" && path === "/api/interaction-costs") {
    const rows = await db.prepare("SELECT interaction_type, cost_coins FROM interaction_costs WHERE is_active = 1 ORDER BY interaction_type").all();
    return json({ ok: true, costs: rows.results || [] });
  }

  if (method === "GET" && path === "/api/wallet") {
    if (!caps.wallet) return unavailable("کیف پول");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "برای مشاهده کیف پول وارد حساب شوید." }, 401);
    const [balance, transactions] = await Promise.all([
      db.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger WHERE user_id = ?").bind(user.id).first(),
      db.prepare("SELECT id, amount, transaction_type, description, created_at FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(user.id).all(),
    ]);
    return json({ ok: true, balance: balance?.balance || 0, transactions: transactions.results || [] });
  }

  if (method === "GET" && path === "/api/pro/status") {
    if (!caps.pro) return unavailable("اشتراک Pro");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "برای مشاهده اشتراک وارد حساب شوید." }, 401);
    const sub = await db.prepare("SELECT plan_code, starts_at, expires_at FROM pro_subscriptions WHERE user_id = ? AND status = 'active' AND starts_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP ORDER BY expires_at DESC LIMIT 1").bind(user.id).first();
    return json({ ok: true, pro: sub ? { active: true, plan_code: sub.plan_code, expires_at: sub.expires_at } : { active: false } });
  }

  if (method === "POST" && path === "/api/pro/checkout") {
    if (!caps.pro) return unavailable("خرید اشتراک Pro");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "برای خرید اشتراک وارد حساب شوید." }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "اطلاعات ارسالی معتبر نیست." }, 400);
    const plan = PRO_PLAN_BY_CODE.get(typeof body.plan_code === "string" ? body.plan_code : "");
    if (!plan) return json({ error: "بسته‌ی Pro انتخاب‌شده معتبر نیست." }, 400);
    if (!UUID_RE.test(String(env.ZARINPAL_MERCHANT_ID || ""))) return json({ error: "درگاه پرداخت هنوز پیکربندی نشده است؛ اشتراک فعال نشده است." }, 503);
    // ۱) رکورد محلی پیش از هر تماس با درگاه ثبت می‌شود؛ اگر این مرحله شکست بخورد، درگاه صدا زده نمی‌شود.
    const payId = crypto.randomUUID();
    const placeholder = `init_${payId}`;
    try {
      await db.prepare("INSERT INTO pro_payments (id, user_id, plan_code, amount_rial, coins, provider, authority, status) VALUES (?, ?, ?, ?, ?, 'zarinpal', ?, 'initiating')")
        .bind(payId, user.id, plan.code, plan.amount_rial, plan.coins, placeholder).run();
    } catch {
      console.error("pro payment record insert failed; gateway not called");
      return json({ error: "ثبت درخواست پرداخت انجام نشد؛ پرداختی آغاز نشده و اشتراک فعال نشده است." }, 503);
    }
    // ۲) درخواست به درگاه؛ مبلغ فقط از کاتالوگ سرور می‌آید.
    let data = null;
    try {
      data = await requestZarinpalPayment(env, request, plan, `اشتراک Pro بسته ${plan.title} — BD2026`);
    } catch {
      data = null;
    }
    const authority = data?.data?.authority;
    if (data?.data?.code !== 100 || typeof authority !== "string" || !AUTHORITY_RE.test(authority)) {
      await db.prepare("UPDATE pro_payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'initiating'").bind(payId).run().catch(() => {});
      return json({ error: "درگاه پرداخت درخواست را نپذیرفت؛ اشتراک فعال نشده است." }, 502);
    }
    // ۳) ثبت authority؛ آدرس پرداخت فقط وقتی برگردانده می‌شود که رکورد محلی ذخیره شده باشد.
    let recorded = false;
    for (let attempt = 0; attempt < 3 && !recorded; attempt++) {
      try {
        const r = await db.prepare("UPDATE pro_payments SET authority = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'initiating'")
          .bind(authority, payId).run();
        recorded = r.meta?.changes === 1;
      } catch {
        recorded = false;
      }
    }
    if (!recorded) {
      // پرداختی بدون آدرس پرداخت باقی می‌ماند و کاربر به آن هدایت نمی‌شود؛ Cron آن را پیگیری و منقضی می‌کند.
      console.error("pro payment authority not recorded; payment URL withheld");
      return json({ error: "ثبت پرداخت انجام نشد؛ پرداختی آغاز نشده و اشتراک فعال نشده است." }, 503);
    }
    const endpoints = zarinpalEndpoints(env);
    return json({ ok: true, payment_url: `${endpoints.pay}/pg/StartPay/${authority}`, plan: { code: plan.code, title: plan.title, coins: plan.coins, amount_rial: plan.amount_rial }, message: "پس از پرداخت موفق، اشتراک و کوین‌های بسته پس از تأیید سرور ثبت می‌شوند." }, 201);
  }

  if (method === "GET" && path === "/api/pro/zarinpal/callback") {
    if (!caps.pro) return redirectTo(`${frontendBase(env)}/?pro=pending`);
    return handleZarinpalCallback(db, env, url);
  }

  if (path === "/api/campaigns" && method === "GET") {
    if (!caps.campaigns) return unavailable("کمپین‌ها");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "برای مشاهده کمپین‌ها وارد حساب شوید." }, 401);
    const rows = await db.prepare("SELECT id, platform, content_url, title, objective, goals_json, status, created_at FROM campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
    const campaigns = (rows.results || []).map(({ goals_json, ...rest }) => ({ ...rest, goals: parseGoals(goals_json) }));
    return json({ ok: true, campaigns });
  }

  if (path === "/api/campaigns" && method === "POST") {
    if (!caps.campaigns) return unavailable("ثبت کمپین");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "برای ثبت کمپین وارد حساب شوید." }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "اطلاعات ارسالی معتبر نیست." }, 400);
    const platform = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
    const contentUrl = typeof body.content_url === "string" ? body.content_url.trim() : "";
    const title = typeof body.title === "string" ? (body.title.trim().slice(0, 160) || null) : null;
    const goals = Array.isArray(body.goals) ? [...new Set(body.goals.filter((x) => typeof x === "string"))] : [];
    if (!ALLOWED_PLATFORMS.has(platform)) return json({ error: "سکوی انتخاب‌شده پشتیبانی نمی‌شود." }, 400);
    if (!validContentUrl(platform, contentUrl)) return json({ error: "فقط پیوند مستقیم محتوای مستقل پذیرفته می‌شود؛ پیوند پروفایل یا کانال مجاز نیست." }, 400);
    if (!goals.length || goals.length > 5 || goals.some((x) => !ALLOWED_GOALS.has(x))) return json({ error: "حداقل یک هدف معتبر برای کمپین انتخاب کنید." }, 400);
    if (goals.includes("subs") && platform !== "youtube") return json({ error: "هدف سابسکرایب فقط برای یوتیوب مجاز است." }, 400);
    const id = crypto.randomUUID();
    // سهمیه و درج در یک دستور: کاربر Pro فعال معاف است؛ دیگران فقط تا سقف روزانه‌ی تهران.
    const result = await db.prepare(`INSERT INTO campaigns (id, user_id, platform, content_url, title, objective, goals_json, status)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'pending_review'
      WHERE EXISTS (SELECT 1 FROM pro_subscriptions WHERE user_id = ? AND status = 'active' AND starts_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP)
         OR (SELECT COUNT(*) FROM campaigns WHERE user_id = ? AND created_at >= ?) < ?`)
      .bind(id, user.id, platform, contentUrl, title, goals.join(","), JSON.stringify(goals), user.id, user.id, tehranDayStartSql(), DAILY_FREE_CAMPAIGN_LIMIT)
      .run();
    if (!(result.meta?.changes > 0)) return json({ error: "سهمیه رایگان ثبت کمپین امروز تکمیل شده است." }, 429);
    return json({ ok: true, campaign: { id, platform, content_url: contentUrl, title, goals, status: "pending_review" }, message: "درخواست کمپین برای بررسی ثبت شد؛ در این مرحله از کیف پول صاحب کمپین مبلغی کسر نشد." }, 201);
  }

  // تسویه‌ی مالی تعامل تا تعرفه‌ی تأییدشده و تأیید واقعی انجام تعامل بسته است؛ هیچ کوینی کسر نمی‌شود.
  if (path.startsWith("/api/campaigns/") && path.endsWith("/interactions") && method === "POST") {
    if (!caps.campaigns || !caps.wallet) return unavailable("ثبت تعامل");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "برای ادامه وارد حساب شوید." }, 401);
    const campaignId = path.slice("/api/campaigns/".length, -"/interactions".length);
    const campaign = await db.prepare("SELECT id FROM campaigns WHERE id = ?").bind(campaignId).first();
    if (!campaign) return json({ error: "کمپین پیدا نشد." }, 404);
    return json({ error: "ثبت مالی تعامل تا تعیین تعرفه‌ی تأییدشده و تکمیل سازوکار تأیید انجام واقعی تعامل غیرفعال است؛ هیچ کوینی کسر نشده است." }, 503);
  }

  return json({ error: "مسیر درخواست پیدا نشد." }, 404);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "مبدأ درخواست مجاز نیست." }, 403, headers);
    try {
      const response = await handle(request, env);
      const merged = new Headers(response.headers);
      for (const [k, v] of Object.entries({ ...headers, ...SECURITY_HEADERS })) merged.set(k, v);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
    } catch (err) {
      console.error("unhandled request error");
      return json({ error: "خطای داخلی سرور رخ داد." }, 500, { ...headers, ...SECURITY_HEADERS });
    }
  },
  // Cron Trigger: بازیابی پرداخت‌های معلق؛ هیچ پرداخت تأییدنشده‌ای فعال نمی‌شود.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(reconcilePendingPayments(env).catch(() => console.error("payment reconciliation failed")));
  },
};