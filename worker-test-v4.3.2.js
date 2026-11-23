// BD2026 Cloudflare Worker — ???? ?.?
// - ????? ?????? ??? ???: credit/debit ??????? ?? idempotency? ????? ?????? ? ??????? ??? ??????
// - ??????????? ???????: ??? ???? ??????? + ???? ??????? ?? ???? API
// - ???? ??????? ?????: ?? ??? Base64 (PBKDF2-SHA256? ??????? ?????) ???? ????? ? ?????? ?????? ?? ?? ????
// - PBKDF2 ?? ?????????? SHA-256 ?? JavaScript (??? Web Crypto ?? Workers: ??????? ?????)
// - ?????? ??????? idempotent ? ???????? ??? DROP ?? ??? ??????? ???? ?????
// - ?????? ????????: ??? ????? ??? ?? ?????? ????? ??? ????? ????? ?????? ??????? ?? Cron
// - ????? ????? ?????? ?? ???? ??? ????? (??–???) × ? ????? × ????? ??????
// - ????? ????? ?? ??? ???? (??? ? ?????)
// - ????? ????? (???? / ????????? / ????? ????? ??????) = ??? ???? ????
// - ??? ?????: ?????????? ?????? ??? ???? ?? ??? ??? (idempotent)
// - ?????? ?????: ????? ?? ????? ???????? ??? ??????? ?????? ?????? ?????????? ????? ?????? ?? ?? ???
// - ???? / ?????? / ????? / ?????? ????????? ???? ????? ????

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const SECURITY_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
const SESSION_DAYS = 30;
const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const LEGACY_PASSWORD_ITERATIONS = 210000; // ???? ??? ????: Base64 ???? ??????
const PASSWORD_ITERATIONS = 210000; // ?????? ????? ???? ?????? ???
const PASSWORD_MAX_ITERATIONS = 1000000; // ??? ????? ????? ?????? ?? (?? DoS)
const WELCOME_COINS = 500;
const DAILY_FREE_CAMPAIGN_LIMIT = 5;
const CAMPAIGN_INTERACTION_QUOTA = 5; // ?? ??? ??????????: ? ????? ???? ?????
const MIN_CAMPAIGN_ACTIVATE_COINS = 2500; // ????? ?????? ???? ?????????/??? ?? ?????
const TARIFF_MIN_COINS = 40;         // ?? ????? ???? ?? ???? ??? ?????
const TARIFF_MAX_COINS = 120;        // ??? ????? ????
const WATCH_REWARD_MAX_COINS = 300;  // ??? ????? ????? ???? ??? ?????
const WATCH_REWARD_MAX_SECONDS = 180;
const MEMBERSHIP_REWARD_COINS = 250; // ????? ???? ???? / ????????? / ???? ??????
// ???? ????? ????? ?? ???? ??? ????? (????? ? ? ??? ??? ? ???) — ??? ?? ?? ?????? ????
const INTERACTION_REWARD_RANGE = Object.freeze({
  views:    [0, 0],        // ????? ???? ?? watch-reward
  likes:    [20, 50],
  shares:   [30, 80],
  comments: [25, 60],
  subs:     [MEMBERSHIP_REWARD_COINS, MEMBERSHIP_REWARD_COINS],
  follow:   [MEMBERSHIP_REWARD_COINS, MEMBERSHIP_REWARD_COINS],
  join:     [MEMBERSHIP_REWARD_COINS, MEMBERSHIP_REWARD_COINS],
});
const INTERACTION_DAILY_COUNT_CAP = 40;       // ??? ????? ????? ????????? ???????? ?? ??? ?????
const INTERACTION_DAILY_COIN_CAP = 2500;      // ??? ???? ?????? ?? ????/???/?????
const MEMBERSHIP_HOLD_HOURS = 12;       // ????? ????? ???? ?????? (??? ?? ??? ???? = ???? ????)
const MEMBERSHIP_DAILY_CAP = 5;         // ??? ????? ????? ?????????/???????? ?? ??? ?????
const MEMBERSHIP_HOURLY_ATTEMPTS = 8;   // ??? ???? ??? ????? ?? ?? ????
const MEMBERSHIP_REJOIN_COOLDOWN_HOURS = 24; // ?????? ????? ???? ?? ?? ??? ??? ???? ?????
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
  { code: "monthly", title: "??????", duration_months: 1, coins: 8000, amount_rial: 2000000 },
  { code: "quarterly", title: "???????", duration_months: 3, coins: 26000, amount_rial: 5400000, saving_percent: 10 },
  { code: "half_year", title: "???????", duration_months: 6, coins: 56000, amount_rial: 10200000, saving_percent: 15 },
]);
const PRO_PLAN_BY_CODE = new Map(PRO_PLANS.map((plan) => [plan.code, plan]));
const ALLOWED_ORIGINS = new Set(["https://bd2026.ir", "https://www.bd2026.ir", "https://ghasem39.github.io", "https://db2026-12.pages.dev"]);
const ALLOWED_GOALS = new Set(["views", "likes", "shares", "comments", "subs"]);
const MEMBERSHIP_GOALS = new Set(["subs", "follow", "join"]); // ????? ???? ??? ???? ???? ??????????
const ALLOWED_PLATFORMS = new Set(["instagram", "youtube", "aparat"]);
const INTEREST_CATALOG = Object.freeze([
  "music", "tech", "sport", "education", "business", "entertainment", "news", "lifestyle", "gaming", "art",
]);
const SUPPORTED_LOCALES = Object.freeze(["fa", "en"]);
const DEFAULT_LOCALE = "fa";

const DUMMY_PASSWORD_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUTHORITY_RE = /^[A-Za-z0-9]{8,64}$/;

// ---------- ????? ?????? ??? ??? (v4.2) ----------
// ??? ??????/??? ???? ??? ?? ??? ???? ???? ??????.
// ??????: idempotency ??????? ???? ????? ??? ?????? ?? ???????? ??? ??? ?? ?????? ????.
export const TX_TYPES = Object.freeze({
  WELCOME_BONUS: "welcome_bonus",
  PRO_COINS: "pro_coins",
  INTERACTION_SPEND: "interaction_spend",
  INTERACTION_REFUND: "interaction_refund",
  WATCH_REWARD: "watch_reward",
  INTERACTION_REWARD: "interaction_reward",
  ADJUSTMENT: "adjustment",
  REVERSAL: "reversal",
});
const TX_TYPE_SET = new Set(Object.values(TX_TYPES));

function assertPositiveInt(n, label) {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`wallet: ${label} must be a positive integer`);
}
function assertTxType(type) {
  if (!TX_TYPE_SET.has(type)) throw new Error(`wallet: unknown transaction_type "${type}"`);
}

/** ?????? ???? ????? (???? ???? ?????) */
export async function getBalance(db, userId) {
  const row = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger WHERE user_id = ?").bind(userId).first();
  return Number(row?.balance || 0);
}

/**
 * ???? statement ?????? (????) ???? ??????? ???? batch.
 * ?? NOT EXISTS ??? idempotency_key ????????? ???.
 */
export function buildCreditStmt(db, { userId, amount, type, description, idempotencyKey, referenceType = null, referenceId = null }) {
  assertPositiveInt(amount, "credit amount");
  assertTxType(type);
  if (typeof idempotencyKey !== "string" || !idempotencyKey) throw new Error("wallet: idempotencyKey required");
  const id = crypto.randomUUID();
  return db.prepare(`INSERT INTO wallet_ledger (id, user_id, amount, transaction_type, description, idempotency_key, reference_type, reference_id)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM wallet_ledger WHERE idempotency_key = ?)`)
    .bind(id, userId, amount, type, description || null, idempotencyKey, referenceType, referenceId, idempotencyKey);
}

/**
 * ???? statement ??? (????) ???? ??????? ???? batch.
 * ?????? ?? ?? ???? INSERT ???? ????? ?????? ?? race ???? ????.
 */
export function buildDebitStmt(db, { userId, amount, type, description, idempotencyKey, referenceType = null, referenceId = null }) {
  assertPositiveInt(amount, "debit amount");
  assertTxType(type);
  if (typeof idempotencyKey !== "string" || !idempotencyKey) throw new Error("wallet: idempotencyKey required");
  const id = crypto.randomUUID();
  const signed = -amount;
  return db.prepare(`INSERT INTO wallet_ledger (id, user_id, amount, transaction_type, description, idempotency_key, reference_type, reference_id)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM wallet_ledger WHERE idempotency_key = ?)
      AND COALESCE((SELECT SUM(amount) FROM wallet_ledger WHERE user_id = ?), 0) >= ?`)
    .bind(id, userId, signed, type, description || null, idempotencyKey, referenceType, referenceId, idempotencyKey, userId, amount);
}

/** ?????? ????? (???? ?? batch ???????) */
export async function creditCoins(db, opts) {
  const stmt = buildCreditStmt(db, opts);
  const result = await stmt.run();
  return { applied: (result.meta?.changes || 0) > 0, balance: await getBalance(db, opts.userId) };
}


/** ??? ?????? ?? ???? ????? ?????? applied=false ??????????? ? ??? ????? ??????? */
export async function debitCoins(db, opts) {
  const stmt = buildDebitStmt(db, opts);
  const result = await stmt.run();
  return { applied: (result.meta?.changes || 0) > 0, balance: await getBalance(db, opts.userId) };
}

// ---------- ??????? ?????? ????? ? ????? (v4.2) ----------
/** ????? ???? ?? ???? ??? ?????: ??? ?? ?? ?? ??? ???? ?…??? ????? */
export function calcUnitTariff(durationSeconds) {
  const s = Math.min(Math.max(1, Math.floor(Number(durationSeconds) || 1)), WATCH_REWARD_MAX_SECONDS);
  return Math.round(TARIFF_MIN_COINS + ((s - 1) / (WATCH_REWARD_MAX_SECONDS - 1)) * (TARIFF_MAX_COINS - TARIFF_MIN_COINS));
}

/** ????? ?? ??? ?????: ????? ???? × ? ????? × ????? ??????? ?????????? */
export function calcCampaignCost(durationSeconds, goals) {
  const n = Array.isArray(goals) ? goals.length : 0;
  if (n <= 0) return 0;
  return calcUnitTariff(durationSeconds) * CAMPAIGN_INTERACTION_QUOTA * n;
}

/** ????? ?????: ??? ??? ???? ?? ??? ?????? ??? ? ????? ?????? */

/** ???? ??????????? ??????? ?? ?? ????? ????? (???????) */
export function buildWelcomeGreeting(name) {
  const n = String(name || "").trim() || "???? ??????";
  const variants = [
    {
      title: `?? BD2026 ??? ????? ${n}!`,
      message: `??? ??? ????? ?? ??????? ???? ??????. ${WELCOME_COINS} ???? ????? ??????????? ???? ???? ?? ??? ???? ????? ?? ????? ?????? ?? ??????? ??????.`,
    },
    {
      title: `${n}? ?????? ????? ?? ?`,
      message: `?? ?????? ?? ????????. ${WELCOME_COINS} ???? ???????? ????? ???? ?? ??? ???? ??? ??? ?? ????? ???????? ???? ??????? ???? ???????? ???????.`,
    },
    {
      title: `???? ${n}? ????? ?????????? ????????`,
      message: `??????? ?? ?????? ????? ?? ? ${WELCOME_COINS} ???? ??????????? ?? ????????? ?????? ??. ???? ?????? ??? ???? ?? ???? ??????.`,
    },
    {
      title: `${n} ????? ?? ??? BD2026 ??????`,
      message: `????? ???? ????: ${WELCOME_COINS} ????. ??? ?????? ???? ?????? ???? ?????? ???? ????? ???? ?????? ? ??? ?????? ???? ?? ????.`,
    },
  ];
  // ?????? ?????? ?? ???? ??? ?? ???? ?? ????? ???? ?????
  let h = 0;
  const s = n + String(WELCOME_COINS);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

export function calcWatchReward(watchedSeconds) {
  const s = Math.min(Math.max(0, Math.floor(Number(watchedSeconds) || 0)), WATCH_REWARD_MAX_SECONDS);
  if (s <= 0) return 0;
  return Math.floor((s / WATCH_REWARD_MAX_SECONDS) * WATCH_REWARD_MAX_COINS);
}

/** ???? ?..? ?? ???? ??? ????? ?? ??? ? ????? */
export function durationFactor(durationSeconds) {
  const s = Math.min(Math.max(1, Math.floor(Number(durationSeconds) || 1)), WATCH_REWARD_MAX_SECONDS);
  return (s - 1) / (WATCH_REWARD_MAX_SECONDS - 1);
}

/** ????? ????? ??????: ???? ????? ????????? (?? ????)? ???? ????? ?? ??? ???? */
export function calcInteractionReward(interactionType, durationSeconds) {
  const range = INTERACTION_REWARD_RANGE[interactionType];
  if (!range) return 0;
  const [min, max] = range;
  if (max <= 0) return 0;
  return Math.round(min + durationFactor(durationSeconds) * (max - min));
}


/** ??? ????? ??? ?????/????? ?? ???? ???? ???? (???? ???????? ????? ????/???/?????) */
async function hasCompletedWatch(db, userId, campaignId, contentUrl, requiredSeconds) {
  const need = Math.max(1, Math.min(WATCH_REWARD_MAX_SECONDS, Math.floor(Number(requiredSeconds) || 1)));
  if (campaignId) {
    const row = await db.prepare(
      `SELECT watched_seconds FROM video_watch_rewards
       WHERE user_id = ? AND campaign_id = ? AND verification_status IN ('verified','pending')
       ORDER BY watched_seconds DESC LIMIT 1`,
    ).bind(userId, campaignId).first();
    if (row && Number(row.watched_seconds) >= need) return true;
  }
  if (contentUrl) {
    const row = await db.prepare(
      `SELECT watched_seconds FROM video_watch_rewards
       WHERE user_id = ? AND content_url = ? AND verification_status IN ('verified','pending')
       ORDER BY watched_seconds DESC LIMIT 1`,
    ).bind(userId, contentUrl).first();
    if (row && Number(row.watched_seconds) >= need) return true;
  }
  return false;
}


function normalizeContentUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    u.hash = "";
    let host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "") || "";
    return `${host}${path}`.toLowerCase();
  } catch {
    return String(raw || "").trim().toLowerCase().slice(0, 300);
  }
}

/** ??? ?????? ? ????????? ??? ????? */
async function membershipRateLimits(db, userId) {
  const dayStart = tehranDayStartSql();
  const hourAgo = sqlTime(Date.now() - 60 * 60 * 1000);
  const daily = await db.prepare(
    `SELECT COUNT(*) AS n FROM video_watch_rewards
     WHERE user_id = ? AND verification_status IN ('pending','verified')
       AND idempotency_key LIKE 'member:%' AND created_at >= ?`,
  ).bind(userId, dayStart).first();
  const hourly = await db.prepare(
    `SELECT COUNT(*) AS n FROM video_watch_rewards
     WHERE user_id = ? AND idempotency_key LIKE 'member:%' AND created_at >= ?`,
  ).bind(userId, hourAgo).first();
  return {
    daily: Number(daily?.n || 0),
    hourly: Number(hourly?.n || 0),
    daily_cap: MEMBERSHIP_DAILY_CAP,
    hourly_cap: MEMBERSHIP_HOURLY_ATTEMPTS,
  };
}

/** ??? ???? ??? ????? ????? ????? ????? ????/???????? ????? */
async function hasActiveMembershipForContent(db, userId, contentUrl) {
  const norm = normalizeContentUrl(contentUrl);
  if (!norm) return false;
  const rows = await db.prepare(
    `SELECT r.id, r.content_url AS reward_url, c.content_url AS campaign_url FROM video_watch_rewards r
     LEFT JOIN campaigns c ON c.id = r.campaign_id
     WHERE r.user_id = ? AND r.verification_status IN ('pending','verified')
       AND r.idempotency_key LIKE 'member:%'`,
  ).bind(userId).all();
  for (const row of rows.results || []) {
    const url = row.reward_url || row.campaign_url || "";
    if (normalizeContentUrl(url) === norm) return true;
  }
  return false;
}

/** ????? ????????? ????? ?? ?? ???? ??? ????? ???????? ?????? */
export async function settleMembershipRewards(db, { limit = 50 } = {}) {
  const cutoff = sqlTime(Date.now() - MEMBERSHIP_HOLD_HOURS * 3600 * 1000);
  const rows = await db.prepare(
    `SELECT id, user_id, campaign_id, reward_coins, idempotency_key FROM video_watch_rewards
     WHERE verification_status = 'pending' AND reward_coins > 0 AND idempotency_key LIKE 'member:%'
       AND created_at <= ? ORDER BY created_at ASC LIMIT ?`,
  ).bind(cutoff, limit).all();
  let settled = 0;
  for (const row of rows.results || []) {
    const claim = await db.prepare(
      "UPDATE video_watch_rewards SET verification_status = 'verified' WHERE id = ? AND verification_status = 'pending'",
    ).bind(row.id).run();
    if (!((claim.meta?.changes || 0) > 0)) continue;
    const creditKey = `member_credit:${row.idempotency_key}`;
    await creditCoins(db, {
      userId: row.user_id,
      amount: Number(row.reward_coins) || MEMBERSHIP_REWARD_COINS,
      type: TX_TYPES.WATCH_REWARD,
      description: "????? ????? (?? ?? ????? ?????)",
      idempotencyKey: creditKey,
      referenceType: "campaign",
      referenceId: row.campaign_id,
    });
    settled++;
  }
  return { settled, scanned: (rows.results || []).length };
}



const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- ?????? ??????? (idempotent) ----------
const PRO_SUBSCRIPTIONS_COLUMNS = `(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_code TEXT NOT NULL CHECK(plan_code IN ('monthly','quarterly','half_year')), status TEXT NOT NULL CHECK(status IN ('pending','active','expired','cancelled','refunded')), starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, payment_reference TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(expires_at > starts_at))`;
const BASE_TABLES = [
  `CREATE TABLE IF NOT EXISTS bd2026_schema_log (id TEXT PRIMARY KEY, note TEXT, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', interests_json TEXT NOT NULL DEFAULT '[]', locale TEXT NOT NULL DEFAULT 'fa', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
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
  `CREATE TABLE IF NOT EXISTS bd2026_payment_settings (setting_key TEXT PRIMARY KEY CHECK(setting_key IN ('zarinpal_enabled','usdt_enabled')), setting_value INTEGER NOT NULL CHECK(setting_value IN (0,1)), updated_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS bd2026_payment_settings_audit (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, changes_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
];
// ????????? ?? ?? ???????? ????? ???? ???????? ??? ?????? ???????.
const ADDITIVE_COLUMNS = {
  campaigns: [
    ["title", "TEXT"],
    ["goals_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["status", "TEXT NOT NULL DEFAULT 'pending_review'"],
    ["duration_seconds", "INTEGER"],
    ["cost_coins", "INTEGER"],
    ["quota_per_goal", "INTEGER NOT NULL DEFAULT 5"],
    ["fulfilled_json", "TEXT NOT NULL DEFAULT '{}'"],
  ],
  wallet_ledger: [["description", "TEXT"], ["idempotency_key", "TEXT"], ["reference_type", "TEXT"], ["reference_id", "TEXT"]],
};
// ????????? ?? ?? ?? ????? ???? ????? ????? ?? ???? ??? ?????? ?????? ?? ??????? ??????.
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

// ?? ????? ?????? ?? ?? ????? ???? ???? ??? ???? ????? ??????? ? ????? ?????????.
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
    if (marker) return { ...report, complete: true, fast_path: true, capabilities: { core: true, wallet: true, campaigns: true, pro: true } };
  } catch {
    // ???? ??? ???? ????? ?????? ???? ???? ??????.
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
  await tryStep(report, "users_profile_v43", () => ensureUserProfileColumns(db, report));
  await tryStep(report, "wallet_idempotency", () => migrateWalletIdempotency(db, report));
  await tryStep(report, "indexes", () => createIndexes(db));
  await tryStep(report, "users_email_unique", () => migrateEmailIndex(db, report));
  await tryStep(report, "capability_check", () => checkCapabilities(db, report));
  report.complete = report.failures.length === 0 && report.capabilities.core && report.capabilities.wallet && report.capabilities.campaigns && report.capabilities.pro;
  if (report.complete) await db.prepare("INSERT OR IGNORE INTO bd2026_schema_log (id, note) VALUES (?, 'ok')").bind(MIGRATION_MARKER).run();
  return report;
}

const PRO_COPY_FROM = (source) => `INSERT INTO pro_subscriptions (id, user_id, plan_code, status, starts_at, expires_at, payment_reference, created_at)
  SELECT id, user_id,
         CASE plan_code
           WHEN 'pro_monthly' THEN 'monthly'
           WHEN 'monthly' THEN 'monthly'
           WHEN 'pro_quarterly' THEN 'quarterly'
           WHEN 'quarterly' THEN 'quarterly'
           WHEN 'pro_semiannual' THEN 'half_year'
           WHEN 'half_year' THEN 'half_year'
         END,
         status, starts_at, expires_at, payment_reference, created_at
  FROM ${source}
  WHERE user_id IN (SELECT id FROM users)
    AND plan_code IN ('pro_monthly','monthly','pro_quarterly','quarterly','pro_semiannual','half_year')
    AND NOT EXISTS (SELECT 1 FROM pro_subscriptions s WHERE s.id = ${source}.id)`;
// ???? ???????? ?? ?? plan ???????? ??? ???????? ?? ???? ??????? ?????????? ??????? ? ?? ????? ????? ???? ??????.
async function reportOrphanProRows(db, report) {
  const orphan = await db.prepare(`SELECT COUNT(*) AS n FROM ${LEGACY_PRO_BACKUP} WHERE user_id NOT IN (SELECT id FROM users)`).first().catch(() => null);
  if (orphan?.n > 0) report.warnings.push(`pro_subscriptions: ${orphan.n} legacy row(s) without a matching user kept untouched in ${LEGACY_PRO_BACKUP}`);
  const unknown = await db.prepare(
    `SELECT COUNT(*) AS n FROM ${LEGACY_PRO_BACKUP}
     WHERE user_id IN (SELECT id FROM users)
       AND plan_code NOT IN ('pro_monthly','monthly','pro_quarterly','quarterly','pro_semiannual','half_year')`,
  ).first().catch(() => null);
  if (unknown?.n > 0) {
    report.warnings.push(
      `pro_subscriptions: ${unknown.n} legacy row(s) with unknown plan_code left untouched in ${LEGACY_PRO_BACKUP}; not copied (NULL plan avoided)`,
    );
  }
}

// ????? ??? ????? ?????: pro_monthly?monthly? pro_quarterly?quarterly? pro_semiannual?half_year.
// ???? ????? ??? ???????? ?? ??? ??????? ????? ??? ??????? ? ??? ?? ??????? ???? ????????? ???.

async function ensureUserProfileColumns(db, report) {
  const cols = await db.prepare("PRAGMA table_info(users)").all();
  const names = new Set((cols.results || []).map((c) => c.name));
  if (!names.has("role")) {
    await db.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'").run();
    report.applied.push("users.role");
  }
  if (!names.has("interests_json")) {
    await db.prepare("ALTER TABLE users ADD COLUMN interests_json TEXT NOT NULL DEFAULT '[]'").run();
    report.applied.push("users.interests_json");
  }
  if (!names.has("locale")) {
    await db.prepare("ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'fa'").run();
    report.applied.push("users.locale");
  }
  const ccols = await db.prepare("PRAGMA table_info(campaigns)").all();
  const cnames = new Set((ccols.results || []).map((c) => c.name));
  if (!cnames.has("topics_json")) {
    await db.prepare("ALTER TABLE campaigns ADD COLUMN topics_json TEXT NOT NULL DEFAULT '[]'").run();
    report.applied.push("campaigns.topics_json");
  }
}

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
        if (!(await columnsOf(db, table)).has(name)) throw err; // ????? ??????? ??????? ????
      }
    }
  }
}

// ??????? ?????? ????? ???? ??? ?? ???????? ????????? ??? ?? ???? ????? ??? ???????.
// ?? ??? ???? ?????? ???? ????? ??????? ? ?????? ?? ??? NOT EXISTS ?????? ???????.
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

// ---------- ???????? ????? ----------
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

// ---------- SHA-256 ? PBKDF2 ?? JavaScript (???? ??????? ??????? ????? Web Crypto) ----------
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H256_INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W_SCRATCH = new Uint32Array(64);
const W_FAST = new Uint32Array(64);
W_FAST[8] = 0x80000000; // ????? ???? ?? ????? ?? ?? ???? ?? ????? ????
W_FAST[15] = 768; // ?? ???? × ? ???
const ITER_INNER = new Uint32Array(8);
const ITER_OUTER = new Uint32Array(8);

function sha256Compress(H, W) {
  for (let i = 16; i < 64; i++) {
    const x = W[i - 15];
    const y = W[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K256[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
  H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
}
function loadBlock(W, bytes, off) {
  for (let i = 0; i < 16; i++) {
    const j = off + 4 * i;
    W[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
  }
}
// H: ???? ???? (priorBytes ???? ????? ??? ???)? data: ?????? ????. ????? ?? ???? H ???.
function shaFinish(H, data, priorBytes) {
  const padLen = Math.ceil((data.length + 9) / 64) * 64;
  const buf = new Uint8Array(padLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const bits = (priorBytes + data.length) * 8;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, Math.floor(bits / 4294967296));
  view.setUint32(padLen - 4, bits >>> 0);
  for (let off = 0; off < padLen; off += 64) {
    loadBlock(W_SCRATCH, buf, off);
    sha256Compress(H, W_SCRATCH);
  }
  return H;
}
function wordsToBytes(words) {
  const out = new Uint8Array(32);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) view.setUint32(4 * i, words[i]);
  return out;
}
function hmacKeyStates(keyBytes) {
  const key = keyBytes.length > 64 ? wordsToBytes(shaFinish(Uint32Array.from(H256_INIT), keyBytes, 0)) : keyBytes;
  const block = new Uint8Array(64);
  block.set(key);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = block[i] ^ 0x36; opad[i] = block[i] ^ 0x5c; }
  const inner = Uint32Array.from(H256_INIT);
  loadBlock(W_SCRATCH, ipad, 0);
  sha256Compress(inner, W_SCRATCH);
  const outer = Uint32Array.from(H256_INIT);
  loadBlock(W_SCRATCH, opad, 0);
  sha256Compress(outer, W_SCRATCH);
  return { inner, outer };
}
function hmacBytesWords(states, msg) {
  const inner = shaFinish(Uint32Array.from(states.inner), msg, 64);
  const innerBytes = wordsToBytes(inner);
  return shaFinish(Uint32Array.from(states.outer), innerBytes, 64);
}
// U(i) ???? ???? ?? ?????? ????? ?? ITER_OUTER ??? ? ??? ?? ???????? ???? ???? ??? ?? ???? ???.
function hmacWordsFast(states, u) {
  const W = W_FAST;
  for (let i = 0; i < 8; i++) W[i] = u[i];
  ITER_INNER.set(states.inner);
  sha256Compress(ITER_INNER, W);
  for (let i = 0; i < 8; i++) W[i] = ITER_INNER[i];
  ITER_OUTER.set(states.outer);
  sha256Compress(ITER_OUTER, W);
  return ITER_OUTER;
}
// PBKDF2-HMAC-SHA256 ?? ????? ?? ???? (?? ????)? ?????? ?? crypto.pbkdf2 ?? Node/OpenSSL.
export function pbkdf2Sha256(passwordBytes, saltBytes, iterations) {
  const states = hmacKeyStates(passwordBytes);
  const block = new Uint8Array(saltBytes.length + 4);
  block.set(saltBytes);
  block[saltBytes.length + 3] = 1;
  let u = hmacBytesWords(states, block);
  const t = Uint32Array.from(u);
  for (let i = 1; i < iterations; i++) {
    u = hmacWordsFast(states, u);
    for (let j = 0; j < 8; j++) t[j] ^= u[j];
  }
  return wordsToBytes(t);
}
function derivePasswordB64(password, saltB64, iterations) {
  return toBase64(pbkdf2Sha256(new TextEncoder().encode(password), fromBase64(saltB64), iterations));
}
function makeStoredPassword(password, saltB64) {
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_ITERATIONS}$${derivePasswordB64(password, saltB64, PASSWORD_ITERATIONS)}`;
}
// ???? ????: pbkdf2-sha256$iterations$hash ? ???? ?????: ??? hash ?? Base64 ?? ??????? ?????.
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

// ---------- ????? ???? ? ??????? ???? ----------
async function requireUser(db, request, env) {
  const token = getBearer(request);
  if (!token) return null;
  const tokenHash = await hmacHex(env.SESSION_SECRET, token);
  return await db.prepare("SELECT users.id, users.name, users.email, users.role, users.interests_json, users.locale, users.created_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
}

function parseInterests(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || "").toLowerCase().trim()).filter((x) => INTEREST_CATALOG.includes(x)))].slice(0, 12);
  }
  if (typeof raw === "string" && raw.trim()) {
    try { return parseInterests(JSON.parse(raw)); } catch { return []; }
  }
  return [];
}

function isOwnerUser(user, env) {
  if (!user) return false;
  if (user.role === "owner") return true;
  const ownerEmail = String(env.OWNER_EMAIL || "").toLowerCase().trim();
  if (ownerEmail && String(user.email || "").toLowerCase() === ownerEmail) return true;
  const ownerIds = String(env.OWNER_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ownerIds.includes(user.id)) return true;
  return false;
}

async function getPaymentSettings(db) {
  const settings = { zarinpal_enabled: true, usdt_enabled: true };
  try {
    const rows = await db.prepare("SELECT setting_key, setting_value FROM bd2026_payment_settings").all();
    for (const row of rows.results || []) if (row.setting_key in settings) settings[row.setting_key] = Number(row.setting_value) === 1;
  } catch { /* defaults apply until the additive migration completes */ }
  return settings;
}
function usdtConfig(env, settings = { usdt_enabled: true }) {
  const address = String(env.USDT_WALLET_ADDRESS || env.WALLET_USDT || env.USDT_ADDRESS || "").trim();
  const network = String(env.USDT_NETWORK || "TRC20").trim().toUpperCase() || "TRC20";
  const enabled = Boolean(address) && network === "TRC20" && settings.usdt_enabled !== false;
  return { enabled, asset: "USDT", network, address: address || null,
    note: enabled ? "International Pro payments use USDT on TRC20 only." : !address ? "USDT wallet address is not configured yet." : network !== "TRC20" ? "Only TRC20 is supported." : "USDT payments are disabled by the platform owner." };
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

// ---------- ?????????? ???? ????? ----------
function validContentUrl(platform, raw) {
  if (typeof raw !== "string" || raw.length > CONTENT_URL_MAX_LENGTH) return false;
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (platform === "instagram") return host === "instagram.com" && /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/i.test(u.pathname);
  if (platform === "youtube") {
    if (host === "youtu.be") return /^\/[A-Za-z0-9_-]{6,}\/?$/.test(u.pathname) && !u.search;
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    if (/^\/(shorts|live)\/[A-Za-z0-9_-]{6,}\/?$/i.test(u.pathname)) return !u.search;
    if (u.pathname === "/watch") return /^[A-Za-z0-9_-]{6,}$/.test(u.searchParams.get("v") || "") && [...u.searchParams.keys()].every((k) => k === "v" || k === "si");
    return false;
  }
  if (platform === "aparat") return host === "aparat.com" && /^\/v\/[A-Za-z0-9_-]+\/?$/i.test(u.pathname) && !u.search;
  return false;
}

async function verifyDirectContent(platform, contentUrl) {
  if (platform !== "youtube") return { verified: false, reason: "manual_review_required" };
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(contentUrl)}&format=json`;
    const response = await fetch(endpoint, { method: "GET", redirect: "error", signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } });
    if (!response.ok) return { verified: false, reason: "platform_unavailable" };
    const data = await response.json();
    const verified = data && data.provider_name === "YouTube" && typeof data.title === "string" && data.title.trim().length > 0;
    return { verified, reason: verified ? "platform_oembed_verified" : "metadata_not_verified" };
  } catch { return { verified: false, reason: "verification_unavailable" }; }
}

function parseGoals(text) {
  try { const v = JSON.parse(text || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ---------- ?????? ???????? ----------
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
// ????????? ?????? ? ???? ?? ?? ?????? D1? ?? ?? ??? ?? ??? NOT EXISTS ???????????.
async function activateProAfterVerification(db, row, plan, refId) {
  const current = await db.prepare("SELECT MAX(expires_at) AS end_at FROM pro_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > CURRENT_TIMESTAMP").bind(row.user_id).first();
  const startAt = current?.end_at || nowSql();
  const ledgerKey = `pro_payment:${row.authority}`;
  await db.batch([
    db.prepare(`INSERT INTO pro_subscriptions (id, user_id, plan_code, status, starts_at, expires_at, payment_reference)
      SELECT ?, ?, ?, 'active', ?, datetime(?, ?), ?
      WHERE NOT EXISTS (SELECT 1 FROM pro_subscriptions WHERE payment_reference = ?)`)
      .bind(crypto.randomUUID(), row.user_id, plan.code, startAt, startAt, `+${plan.duration_months} months`, row.authority, row.authority),
    buildCreditStmt(db, {
      userId: row.user_id,
      amount: plan.coins,
      type: TX_TYPES.PRO_COINS,
      description: `?????? ???? ${plan.title} Pro`,
      idempotencyKey: ledgerKey,
      referenceType: "pro_payment",
      referenceId: row.id,
    }),
    db.prepare("UPDATE pro_payments SET status = 'verified', ref_id = ?, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(refId, row.id),
  ]);
}
// ????? ? ??????? ?? ?????? ?? ????? ?? CAS ?? ????? verifying ???? ??? ???.
// final=true (callback): ????? ?????? ? failed. final=false (Cron): ????? ?? pending ?? ???? ????.
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
// Cron: ?????????? ???? ?? ?????? ????? ??????? ?????? ????????? ???? ???? ???????.
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

// ---------- ???????? ? ????? ----------
function configStatus(env) {
  const secret = env.SESSION_SECRET;
  const merchant = env.ZARINPAL_MERCHANT_ID;
  const frontend = typeof env.FRONTEND_URL === "string" ? env.FRONTEND_URL.trim().replace(/\/+$/, "") : "";
  const publicUrl = typeof env.PUBLIC_API_URL === "string" ? env.PUBLIC_API_URL.trim() : "";
  return {
    d1_binding: env.DB ? "present" : "missing",
    session_secret: typeof secret !== "string" || secret.length === 0 ? "missing" : secret.length < 32 ? "too_short" : "ok",
    usdt_wallet: ((env.USDT_WALLET_ADDRESS || env.WALLET_USDT || env.USDT_ADDRESS) ? "present" : "missing"),
      zarinpal_merchant_id: merchant == null || merchant === "" ? "missing" : UUID_RE.test(String(merchant)) ? "ok" : "invalid_format",
    zarinpal_mode: env.ZARINPAL_SANDBOX === "true" ? "sandbox" : "production",
    public_api_url: /^https:\/\/[^/]+$/i.test(publicUrl) ? "set" : publicUrl ? "invalid_ignored" : "derived_from_request",
    frontend_url: !frontend ? "default" : FRONTEND_URLS.has(frontend) ? "custom_allowed" : "rejected_using_default",
  };
}
// ????? ????? ??? ????? ?? ???? ??????? ??? ????? Secret? ???? ?? ??????? ????? ?? ????? ????.
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
    version: "v4.3.2-test",
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

// ---------- ??????? API ----------
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  if (method === "GET" && (path === "/" || path === "/api/health")) return healthReport(env);
  // ??????? Pro ????? ??? ? ?? ?????? ???? ?????? ????.
  if (method === "GET" && path === "/api/config/public") {
    return json({
      ok: true,
      locales: SUPPORTED_LOCALES,
      default_locale: DEFAULT_LOCALE,
      interests_catalog: INTEREST_CATALOG,
      min_campaign_activate_coins: MIN_CAMPAIGN_ACTIVATE_COINS,
      watch_reward_max_coins: WATCH_REWARD_MAX_COINS,
      watch_reward_max_seconds: WATCH_REWARD_MAX_SECONDS,
      usdt: usdtConfig(env, await getPaymentSettings(env.DB)),
      payments: await getPaymentSettings(env.DB),
      version: "v4.3.1",
    });
  }

  if ((method === "GET" || method === "PATCH") && path === "/api/owner/payment-settings") {
    const owner = await requireUser(db, request, env);
    if (!owner || !isOwnerUser(owner, env)) return json({ error: "Owner access required." }, 403);
    if (method === "GET") return json({ ok: true, settings: await getPaymentSettings(db) });
    const body = await readJson(request);
    if (!body || (typeof body.zarinpal_enabled !== "boolean" && typeof body.usdt_enabled !== "boolean")) return json({ error: "At least one payment setting must be boolean." }, 400);
    const before = await getPaymentSettings(db), changes = {}, batch = [];
    for (const key of ["zarinpal_enabled", "usdt_enabled"]) if (typeof body[key] === "boolean" && body[key] !== before[key]) {
      changes[key] = { from: before[key], to: body[key] };
      batch.push(db.prepare("INSERT INTO bd2026_payment_settings (setting_key, setting_value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP").bind(key, body[key] ? 1 : 0, owner.id));
    }
    if (Object.keys(changes).length) {
      batch.push(db.prepare("INSERT INTO bd2026_payment_settings_audit (id, actor_user_id, changes_json) VALUES (?, ?, ?)").bind(crypto.randomUUID(), owner.id, JSON.stringify(changes)));
      await db.batch(batch);
    }
    return json({ ok: true, settings: await getPaymentSettings(db), changed: changes });
  }

  if (method === "PATCH" && path === "/api/auth/me") {
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ???? ????." }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const interests = body.interests !== undefined ? parseInterests(body.interests) : parseInterests(user.interests_json);
    let locale = user.locale || DEFAULT_LOCALE;
    if (typeof body.locale === "string") {
      locale = body.locale.trim().toLowerCase();
      if (!SUPPORTED_LOCALES.includes(locale)) locale = DEFAULT_LOCALE;
    }
    await db.prepare("UPDATE users SET interests_json = ?, locale = ? WHERE id = ?").bind(JSON.stringify(interests), locale, user.id).run();
    return json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role || "user", interests, locale, is_owner: isOwnerUser({ ...user, role: user.role }, env) } });
  }

  if (method === "GET" && path === "/api/pro/crypto") {
    const u = usdtConfig(env, await getPaymentSettings(db));
    return json({
      ok: true,
      payment_provider: "usdt",
      ...u,
      plans: PRO_PLANS.map((p) => ({
        code: p.code,
        title: p.title,
        coins: p.coins,
        amount_rial: p.amount_rial,
        // ???? ??? ????? ???? ????/??? ??? ????? ??????? ???? ????????
        amount_usdt_hint: null,
      })),
      message: u.enabled
        ? "???? ?????? ?????????? Pro ?? USDT ??????? ???? ? ???? ?????? ?? ???? ????? ????? ????."
        : "?????? ??? ???? ???? ???? ???????? ???? ???.",
    });
  }

  if (method === "POST" && path === "/api/pro/crypto/intent") {
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ????? ???? ???? ????." }, 401);
    const u = usdtConfig(env);
    if (!u.enabled) return json({ error: "???? ??? ??? ??? ????? ???? ???." }, 503);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const plan = PRO_PLAN_BY_CODE.get(String(body.plan_code || ""));
    if (!plan) return json({ error: "???? ??????? ???." }, 400);
    const intentId = crypto.randomUUID();
    return json({
      ok: true,
      intent_id: intentId,
      plan: { code: plan.code, title: plan.title, coins: plan.coins },
      pay_to: { asset: "USDT", network: u.network, address: u.address },
      message: "???? ????????? ?? ?? ???? ??? ????? ????? ?? ?? ????? ????/????????? ?????? ???? ??????.",
    }, 201);
  }

  if (method === "GET" && path === "/api/pro/plans") {
    const settings = await getPaymentSettings(env.DB);
    return json({ ok: true, currency: "IRR", payment_provider: "zarinpal", enabled: settings.zarinpal_enabled && UUID_RE.test(String(env.ZARINPAL_MERCHANT_ID || "")), plans: PRO_PLANS });
  }

  if (!env.DB) return json({ error: "????? ?????? ???? (binding ?? ??? DB) ????? ???? ???." }, 503);
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) return json({ error: "??? ?????? SESSION_SECRET ????? ???? ?? ??? ?? ???? ?? ?? ????? ???." }, 503);
  const db = env.DB;
  const schema = await ensureSchema(db);
  const caps = schema.capabilities;
  if (!caps.core) return json({ error: "?????? ?????? ???? ????? ????? ?????? ?? /api/health ??? ??? ???." }, 503);
  const unavailable = (what) => json({ error: `${what} ????? ?? ????? ????? ????? ?????? ???? ?? /api/health ????? ???.` }, 503);


  if (method === "POST" && path === "/api/auth/owner-access") {
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const expected = String(env.OWNER_ACCESS_CODE || "").trim();
    if (!expected || !code || code !== expected) {
      return json({ error: "?? ?????? ???? ??????? ???." }, 403);
    }
    try {
      await ensureUserProfileColumns(db, { applied: [], warnings: [], failures: [] });
    } catch (e) {
      console.error("owner profile columns", e);
    }
    const ownerEmail = String(env.OWNER_EMAIL || "owner@bd2026.ir").toLowerCase().trim();
    let user = null;
    try {
      user = await db.prepare("SELECT id, name, email, role, interests_json, locale, created_at FROM users WHERE lower(email) = ? LIMIT 1").bind(ownerEmail).first();
    } catch {
      user = await db.prepare("SELECT id, name, email, created_at FROM users WHERE lower(email) = ? LIMIT 1").bind(ownerEmail).first();
    }
    if (!user) {
      const id = crypto.randomUUID();
      const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
      const hash = makeStoredPassword(randomHex(16), salt);
      try {
        await db.prepare("INSERT INTO users (id, name, email, password_hash, password_salt, role, interests_json, locale) VALUES (?, ?, ?, ?, ?, 'owner', '[]', 'fa')")
          .bind(id, "???? ??????", ownerEmail, hash, salt).run();
      } catch {
        await db.prepare("INSERT INTO users (id, name, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)")
          .bind(id, "???? ??????", ownerEmail, hash, salt).run();
        try { await db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").bind(id).run(); } catch {}
      }
      try {
        user = await db.prepare("SELECT id, name, email, role, interests_json, locale, created_at FROM users WHERE id = ?").bind(id).first();
      } catch {
        user = await db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").bind(id).first();
      }
    } else {
      try { await db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").bind(user.id).run(); } catch {}
      user.role = "owner";
    }
    if (!user?.id) return json({ error: "????? ???? ???? ???? ???." }, 500);
    const token = randomHex(32);
    const tokenHash = await hmacHex(env.SESSION_SECRET, token);
    // ???? ??????? ???? (~?? ???) ?? ?? ??? ???? ?? ???? ?????
    const expires = sqlTime(Date.now() + 3650 * 86400000);
    await db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, tokenHash, expires).run();
    return json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: "owner", is_owner: true, locale: user.locale || "fa" },
      persistent: true,
      message: "???? ???? ??? ??? ?????? ??? ??? ?????? ??????? ???.",
    });
  }

  if (method === "POST" && path === "/api/auth/register") {
    if (!caps.wallet) return unavailable("???????");
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 80) return json({ error: "??? ???? ??? ? ?? ?? ????? ????." }, 400);
    if (!EMAIL_RE.test(email) || email.length > 190) return json({ error: "????? ????? ????." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "??????? ???? ??? ? ?? ??? ????? ????." }, 400);
    const interests = parseInterests(body.interests);
    let locale = typeof body.locale === "string" ? body.locale.trim().toLowerCase() : DEFAULT_LOCALE;
    if (!SUPPORTED_LOCALES.includes(locale)) locale = DEFAULT_LOCALE;
    if (!await allowAuthAttempt(db, env, request)) return json({ error: "????? ?????????? ???? ???? ??? ??? ?????? ???? ????." }, 429);
    const exists = await db.prepare("SELECT id FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first();
    if (exists) return json({ error: "??? ????? ????? ??? ??? ???? ???? ???? ????." }, 409);
    const id = crypto.randomUUID();
    const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = makeStoredPassword(password, salt);
    const welcomeKey = `welcome:${id}`;
    try {
      // ????? ? ?????? ??? ????? ?? ?? ??????? ???? ???? ? ??? NOT EXISTS ???? ??? ????????? ???? ??????.
      await db.batch([
        db.prepare("INSERT INTO users (id, name, email, password_hash, password_salt, role, interests_json, locale) VALUES (?, ?, ?, ?, ?, 'user', ?, ?)").bind(id, name, email, hash, salt, JSON.stringify(interests), locale),
        buildCreditStmt(db, {
          userId: id,
          amount: WELCOME_COINS,
          type: TX_TYPES.WELCOME_BONUS,
          description: "?????? ???????????",
          idempotencyKey: welcomeKey,
          referenceType: "user",
          referenceId: id,
        }),
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) return json({ error: "??? ????? ????? ??? ??? ???? ???? ???? ????." }, 409);
      console.error("register transaction failed");
      return json({ error: "??????? ????? ???? ?????? ???? ???? ?? ?? ???????? ???? ??????." }, 500);
    }
    const token = await createSession(db, env, id);
    const user = await db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").bind(id).first();
    const greeting = buildWelcomeGreeting(name);
    return json({
      ok: true,
      user: safeUser(user),
      token,
      welcome_coins: WELCOME_COINS,
      welcome: {
        coins: WELCOME_COINS,
        title: greeting.title,
        message: greeting.message,
        granted: true,
      },
      message: `${greeting.title} ${greeting.message}`,
    }, 201);
  }

  if (method === "POST" && path === "/api/auth/login") {
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!EMAIL_RE.test(email) || email.length > 190 || !password || password.length > 128) return json({ error: "????? ?? ??????? ?????? ???." }, 401);
    if (!await allowAuthAttempt(db, env, request)) return json({ error: "????? ?????????? ???? ???? ??? ??? ?????? ???? ????." }, 429);
    const user = await db.prepare("SELECT id, name, email, password_hash, password_salt, role, interests_json, locale, created_at FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first();
    const stored = parseStoredPassword(user?.password_hash);
    // ???? ????? ?????? ?? PBKDF2 ???? ?????? ?? ???? ???? ?????? ?????? ????.
    const candidate = derivePasswordB64(password, user?.password_salt || DUMMY_PASSWORD_SALT, stored?.iterations ?? PASSWORD_ITERATIONS);
    if (!user || !stored || !constantTimeEqual(candidate, stored.hash)) return json({ error: "????? ?? ??????? ?????? ???." }, 401);
    if (stored.format !== "current" || stored.iterations !== PASSWORD_ITERATIONS) {
      // ?????? ?? ??? ?? ?? ???? ????? ??? ?????? ??? ???? ???? ??????? ? ???? ?????????? ???????.
      try {
        const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
        const upgraded = makeStoredPassword(password, salt);
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
    return json({ ok: true, message: "???? ????? ??." });
  }

  if (method === "GET" && path === "/api/auth/me") {
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ????? ???? ???? ????." }, 401);
    return json({ ok: true, user: { ...safeUser(user), role: user.role||"user", is_owner: isOwnerUser(user, env) } });
  }

  if (method === "GET" && path === "/api/interaction-costs") {
    const rows = await db.prepare("SELECT interaction_type, cost_coins FROM interaction_costs WHERE is_active = 1 ORDER BY interaction_type").all();
    return json({ ok: true, costs: rows.results || [] });
  }

  if (method === "GET" && path === "/api/wallet") {
    if (!caps.wallet) return unavailable("??? ???");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ?????? ??? ??? ???? ???? ????." }, 401);
    const [balance, transactions] = await Promise.all([
      getBalance(db, user.id),
      db.prepare("SELECT id, amount, transaction_type, description, reference_type, reference_id, created_at FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(user.id).all(),
    ]);
    return json({ ok: true, balance, transactions: transactions.results || [] });
  }

  if (method === "GET" && path === "/api/pro/status") {
    if (!caps.pro) return unavailable("?????? Pro");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ?????? ?????? ???? ???? ????." }, 401);
    const sub = await db.prepare("SELECT plan_code, starts_at, expires_at FROM pro_subscriptions WHERE user_id = ? AND status = 'active' AND starts_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP ORDER BY expires_at DESC LIMIT 1").bind(user.id).first();
    return json({ ok: true, pro: sub ? { active: true, plan_code: sub.plan_code, expires_at: sub.expires_at } : { active: false } });
  }

  if (method === "POST" && path === "/api/pro/checkout") {
    if (!caps.pro) return unavailable("???? ?????? Pro");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ???? ?????? ???? ???? ????." }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const plan = PRO_PLAN_BY_CODE.get(typeof body.plan_code === "string" ? body.plan_code : "");
    if (!(await getPaymentSettings(db)).zarinpal_enabled) return json({ error: "Rial payments are temporarily disabled." }, 503);
    if (!plan) return json({ error: "?????? Pro ?????????? ????? ????." }, 400);
    if (!UUID_RE.test(String(env.ZARINPAL_MERCHANT_ID || ""))) return json({ error: "????? ?????? ???? ???????? ???? ???? ?????? ???? ???? ???." }, 503);
    // ?) ????? ???? ??? ?? ?? ???? ?? ????? ??? ??????? ??? ??? ????? ???? ?????? ????? ??? ??? ???????.
    const payId = crypto.randomUUID();
    const placeholder = `init_${payId}`;
    try {
      await db.prepare("INSERT INTO pro_payments (id, user_id, plan_code, amount_rial, coins, provider, authority, status) VALUES (?, ?, ?, ?, ?, 'zarinpal', ?, 'initiating')")
        .bind(payId, user.id, plan.code, plan.amount_rial, plan.coins, placeholder).run();
    } catch {
      console.error("pro payment record insert failed; gateway not called");
      return json({ error: "??? ??????? ?????? ????? ???? ??????? ???? ???? ? ?????? ???? ???? ???." }, 503);
    }
    // ?) ??????? ?? ?????? ???? ??? ?? ??????? ???? ??????.
    let data = null;
    try {
      data = await requestZarinpalPayment(env, request, plan, `?????? Pro ???? ${plan.title} — BD2026`);
    } catch {
      data = null;
    }
    const authority = data?.data?.authority;
    if (data?.data?.code !== 100 || typeof authority !== "string" || !AUTHORITY_RE.test(authority)) {
      await db.prepare("UPDATE pro_payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'initiating'").bind(payId).run().catch(() => {});
      return json({ error: "????? ?????? ??????? ?? ???????? ?????? ???? ???? ???." }, 502);
    }
    // ?) ??? authority? ???? ?????? ??? ???? ????????? ?????? ?? ????? ???? ????? ??? ????.
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
      // ??????? ???? ???? ?????? ???? ??????? ? ????? ?? ?? ????? ???????? Cron ?? ?? ?????? ? ????? ??????.
      console.error("pro payment authority not recorded; payment URL withheld");
      return json({ error: "??? ?????? ????? ???? ??????? ???? ???? ? ?????? ???? ???? ???." }, 503);
    }
    const endpoints = zarinpalEndpoints(env);
    return json({ ok: true, payment_url: `${endpoints.pay}/pg/StartPay/${authority}`, plan: { code: plan.code, title: plan.title, coins: plan.coins, amount_rial: plan.amount_rial }, message: "?? ?? ?????? ????? ?????? ? ???????? ???? ?? ?? ????? ???? ??? ???????." }, 201);
  }

  if (method === "GET" && path === "/api/pro/zarinpal/callback") {
    if (!caps.pro) return redirectTo(`${frontendBase(env)}/?pro=pending`);
    return handleZarinpalCallback(db, env, url);
  }


  // ??? ???: ????????? ?????? ???? ????? / ????? (???? ??????? ???????)
  if (path === "/api/campaigns/featured" && method === "GET") {
    if (!caps.campaigns) return unavailable("campaigns");
    const featured = await db.prepare("SELECT id, platform, content_url, title, created_at FROM campaigns WHERE status = 'published' ORDER BY created_at DESC LIMIT 1").first();
    return json({ ok: true, campaign: featured ? { id: featured.id, platform: featured.platform, url: featured.content_url, title: featured.title, created_at: featured.created_at } : null });
  }

  if (path === "/api/campaigns/discover" && method === "GET") {
    if (!caps.campaigns) return unavailable("??? ?????");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ??? ????? ???? ???? ????." }, 401);
    const platform = (url.searchParams.get("platform") || "").toLowerCase().trim();
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    const userInterests = parseInterests(user.interests_json);
    let sql = `SELECT id, platform, content_url, title, objective, goals_json, status, duration_seconds, quota_per_goal, fulfilled_json, topics_json, created_at
      FROM campaigns WHERE user_id != ? AND status = 'published'`;
    const binds = [user.id];
    if (platform && ALLOWED_PLATFORMS.has(platform)) {
      sql += ` AND platform = ?`;
      binds.push(platform);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    binds.push(Math.min(100, limit * 3));
    const rows = await db.prepare(sql).bind(...binds).all();
    const campaigns = (rows.results || []).map(({ goals_json, fulfilled_json, topics_json, ...rest }) => {
      let fulfilled = {};
      try { fulfilled = fulfilled_json ? JSON.parse(fulfilled_json) : {}; } catch { fulfilled = {}; }
      const topics = parseInterests(topics_json);
      let score = 0;
      if (userInterests.length && topics.length) {
        score = topics.filter((t) => userInterests.includes(t)).length;
      }
      return {
        ...rest,
        topics,
        goals: parseGoals(goals_json),
        fulfilled,
        quota_per_goal: rest.quota_per_goal ?? CAMPAIGN_INTERACTION_QUOTA,
        interest_score: score,
      };
    });
    campaigns.sort((a, b) => (b.interest_score - a.interest_score) || String(b.created_at).localeCompare(String(a.created_at)));
    return json({
      ok: true,
      campaigns: campaigns.slice(0, limit),
      platforms: [...ALLOWED_PLATFORMS],
      interests_catalog: INTEREST_CATALOG,
      user_interests: userInterests,
      personalized: userInterests.length > 0,
    });
  }

  if (path === "/api/campaigns" && method === "GET") {
    if (!caps.campaigns) return unavailable("????????");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ?????? ???????? ???? ???? ????." }, 401);
    const rows = await db.prepare("SELECT id, platform, content_url, title, objective, goals_json, status, duration_seconds, cost_coins, quota_per_goal, fulfilled_json, created_at FROM campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
    const campaigns = (rows.results || []).map(({ goals_json, fulfilled_json, ...rest }) => {
      let fulfilled = {};
      try { fulfilled = fulfilled_json ? JSON.parse(fulfilled_json) : {}; } catch { fulfilled = {}; }
      return { ...rest, goals: parseGoals(goals_json), fulfilled, quota_per_goal: rest.quota_per_goal ?? CAMPAIGN_INTERACTION_QUOTA };
    });
    return json({ ok: true, campaigns });
  }

  if (path === "/api/campaigns" && method === "POST") {
    if (!caps.campaigns || !caps.wallet) return unavailable("??? ?????");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ??? ????? ???? ???? ????." }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const platform = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
    const contentUrl = typeof body.content_url === "string" ? body.content_url.trim() : "";
    const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
    const title = titleRaw ? titleRaw.slice(0, 160) : null;
    const goals = Array.isArray(body.goals) ? [...new Set(body.goals.filter((x) => typeof x === "string").map((g) => g.toLowerCase().trim()))] : [];
    const durationSeconds = Math.floor(Number(body.duration_seconds));
    if (!ALLOWED_PLATFORMS.has(platform)) return json({ error: "???? ?????????? ???????? ???????." }, 400);
    if (!validContentUrl(platform, contentUrl)) return json({ error: "??? ????? ?????? ?????? ????? ??????? ??????? ????? ??????? ?? ????? ???? ????." }, 400);
    if (!goals.length || goals.length > 5 || goals.some((x) => !ALLOWED_GOALS.has(x))) {
      return json({ error: "????? ?? ??? ????? ?????? ???? (views? likes? shares? comments? subs? follow? join)." }, 400);
    }
    if (goals.includes("subs") && platform !== "youtube") return json({ error: "??? ????????? ??? ???? ?????? ???? ???." }, 400);
    if (goals.includes("follow") && platform !== "instagram" && platform !== "youtube") {
      return json({ error: "??? ???? ??? ???? ?????????? ?? ?????? ???? ???." }, 400);
    }
    if (goals.includes("join") && platform !== "telegram") {
      return json({ error: "??? ????? ????? ??? ???? ?????? ???? ???." }, 400);
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) {
      return json({ error: "??? ????? (duration_seconds) ???? ??? ? ?? ???? ????? ????." }, 400);
    }
    const unitTariff = calcUnitTariff(durationSeconds);
    const costCoins = calcCampaignCost(durationSeconds, goals);
    const balance = await getBalance(db, user.id);
    const owner = isOwnerUser(user, env);
    if (!owner && balance < MIN_CAMPAIGN_ACTIVATE_COINS) {
      return json({
        error: "???? ????????? ????? ????? ???? ???? ???? ???. ?? ?????? ???? ??????? ? ????? ????? (????? ??????? ????? ?????????) ???? ??? ????.",
        required_coins: MIN_CAMPAIGN_ACTIVATE_COINS,
        campaign_cost: costCoins,
        balance,
        min_activate_coins: MIN_CAMPAIGN_ACTIVATE_COINS,
        unit_tariff: unitTariff,
        quota_per_goal: CAMPAIGN_INTERACTION_QUOTA,
        goals,
      }, 402);
    }
    if (!owner && balance < costCoins) {
      return json({
        error: "?????? ??? ??? ???? ????? ??? ????? ???? ????.",
        required_coins: costCoins,
        balance,
        min_activate_coins: MIN_CAMPAIGN_ACTIVATE_COINS,
        unit_tariff: unitTariff,
        quota_per_goal: CAMPAIGN_INTERACTION_QUOTA,
        goals,
      }, 402);
    }
    const contentVerification = await verifyDirectContent(platform, contentUrl);
    const campaignStatus = contentVerification.verified ? "published" : "pending_review";
    const id = crypto.randomUUID();
    const ledgerKey = `campaign_cost:${id}`;
    try {
      if (!owner) {
        const quotaOk = await db.prepare(`SELECT (
            EXISTS (SELECT 1 FROM pro_subscriptions WHERE user_id = ? AND status = 'active' AND starts_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP)
            OR (SELECT COUNT(*) FROM campaigns WHERE user_id = ? AND created_at >= ?) < ?
          ) AS ok`).bind(user.id, user.id, tehranDayStartSql(), DAILY_FREE_CAMPAIGN_LIMIT).first();
        if (!quotaOk?.ok) return json({ error: "????? ??? ????? ????? ????? ??? ??? (?????? ? ????? ?? ???)." }, 429);
      }

      const debitStmt = owner ? null : buildDebitStmt(db, {
        userId: user.id,
        amount: costCoins,
        type: TX_TYPES.INTERACTION_SPEND,
        description: `????? ??? ????? (${goals.join("? ")}) — ????? ???? ${unitTariff}`,
        idempotencyKey: ledgerKey,
        referenceType: "campaign",
        referenceId: id,
      });
      const topics = parseInterests(body.topics);
      const insertStmt = db.prepare(
        `INSERT INTO campaigns (id, user_id, platform, content_url, title, objective, goals_json, status, duration_seconds, cost_coins, quota_per_goal, fulfilled_json, topics_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
      ).bind(id, user.id, platform, contentUrl, title, goals.join(","), JSON.stringify(goals), campaignStatus, durationSeconds, owner ? 0 : costCoins, CAMPAIGN_INTERACTION_QUOTA, JSON.stringify(topics));

      if (owner) {
        const results = await db.batch([insertStmt]);
        if (!((results[0]?.meta?.changes || 0) > 0)) {
          return json({ error: "??? ????? ????? ???? ?????? ???? ????." }, 409);
        }
      } else {
        const results = await db.batch([debitStmt, insertStmt]);
        const debited = (results[0]?.meta?.changes || 0) > 0;
        const inserted = (results[1]?.meta?.changes || 0) > 0;
        if (!debited || !inserted) {
          return json({ error: "??? ????? ????? ???? ?????? ?? ????? ???? ????." }, 409);
        }
      }
    } catch (err) {
      console.error("campaign create failed");
      return json({ error: "??? ????? ????? ???? ?????? ???? ????." }, 500);
    }
    const newBalance = await getBalance(db, user.id);
    const charged = owner ? 0 : costCoins;
    return json({
      ok: true,
      campaign: {
        id, platform, content_url: contentUrl, title, goals, status: campaignStatus, review_reason: contentVerification.reason,
        duration_seconds: durationSeconds, cost_coins: charged,
        unit_tariff: unitTariff, quota_per_goal: CAMPAIGN_INTERACTION_QUOTA, fulfilled: {},
        owner_bypass: owner,
      },
      charged_coins: charged,
      balance: newBalance,
      is_owner: owner,
      message: owner
        ? `????? ?? ?????? ???? ???? ??? ???? ??? ??.`
        : `????? ??? ??. ${costCoins} ???? ??? ?? (????? ???? ${unitTariff} × ${CAMPAIGN_INTERACTION_QUOTA} × ${goals.length} ???).`,
    }, 201);
  }

  if (method === "POST" && path === "/api/campaigns/quote") {
    if (!caps.campaigns) return unavailable("??????? ?????");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ??????? ????? ???? ???? ????." }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const goals = Array.isArray(body.goals) ? [...new Set(body.goals.filter((x) => typeof x === "string").map((g) => g.toLowerCase().trim()))] : [];
    const durationSeconds = Math.floor(Number(body.duration_seconds));
    if (!goals.length || goals.some((x) => !ALLOWED_GOALS.has(x))) return json({ error: "????? ??????? ???." }, 400);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1) return json({ error: "??? ????? ??????? ???." }, 400);
    const unitTariff = calcUnitTariff(durationSeconds);
    const costCoins = calcCampaignCost(durationSeconds, goals);
    const balance = await getBalance(db, user.id);
    return json({
      ok: true,
      duration_seconds: Math.min(durationSeconds, WATCH_REWARD_MAX_SECONDS),
      unit_tariff: unitTariff,
      tariff_range: { min: TARIFF_MIN_COINS, max: TARIFF_MAX_COINS },
      quota_per_goal: CAMPAIGN_INTERACTION_QUOTA,
      goals,
      cost_coins: costCoins,
      balance,
      sufficient: balance >= costCoins,
      formula: "unit_tariff × 5 × ?????_??????",
    });
  }

  if (method === "POST" && path === "/api/watch-reward") {
    if (!caps.wallet) return unavailable("????? ?????");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ?????? ????? ???? ???? ????." }, 401);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const watchedSeconds = Math.floor(Number(body.watched_seconds));
    const contentUrl = typeof body.content_url === "string" ? body.content_url.trim().slice(0, CONTENT_URL_MAX_LENGTH) : "";
    const campaignId = typeof body.campaign_id === "string" && UUID_RE.test(body.campaign_id) ? body.campaign_id : null;
    const clientKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim().slice(0, 120) : "";
    if (!Number.isFinite(watchedSeconds) || watchedSeconds < 1) return json({ error: "??? ????? ??????? ???." }, 400);
    if (!contentUrl && !campaignId) return json({ error: "????? ????? ?? ????? ????? ???? ???." }, 400);
    if (!clientKey) return json({ error: "???? ????? ??????? (idempotency_key) ???? ???." }, 400);
    const reward = calcWatchReward(watchedSeconds);
    if (reward <= 0) return json({ error: "??? ????? ???? ????? ???? ????." }, 400);
    const idem = `watch:${user.id}:${clientKey}`;
    const effectiveSeconds = Math.min(watchedSeconds, WATCH_REWARD_MAX_SECONDS);
    try {
      await db.batch([
        db.prepare(`INSERT INTO video_watch_rewards (id, user_id, campaign_id, content_url, watched_seconds, reward_coins, verification_status, idempotency_key)
          SELECT ?, ?, ?, ?, ?, ?, 'verified', ?
          WHERE NOT EXISTS (SELECT 1 FROM video_watch_rewards WHERE user_id = ? AND idempotency_key = ?)`)
          .bind(crypto.randomUUID(), user.id, campaignId, contentUrl || "", effectiveSeconds, reward, idem, user.id, idem),
        buildCreditStmt(db, {
          userId: user.id,
          amount: reward,
          type: TX_TYPES.WATCH_REWARD,
          description: `????? ????? (${effectiveSeconds} ?????)`,
          idempotencyKey: idem,
          referenceType: campaignId ? "campaign" : "content",
          referenceId: campaignId || contentUrl.slice(0, 64),
        }),
      ]);
    } catch (err) {
      console.error("watch reward failed");
      return json({ error: "??? ????? ????? ???." }, 500);
    }
    const balance = await getBalance(db, user.id);
    const already = await db.prepare("SELECT reward_coins FROM video_watch_rewards WHERE user_id = ? AND idempotency_key = ?").bind(user.id, idem).first();
    return json({
      ok: true,
      reward_coins: already?.reward_coins ?? reward,
      watched_seconds: effectiveSeconds,
      capped_at_seconds: WATCH_REWARD_MAX_SECONDS,
      max_reward_coins: WATCH_REWARD_MAX_COINS,
      balance,
      message: watchedSeconds > WATCH_REWARD_MAX_SECONDS
        ? "????? ?? ???? ??? ? ????? ?????? ? ????? ??."
        : "????? ????? ????? ??.",
    }, 200);
  }

  if (path.startsWith("/api/campaigns/") && path.endsWith("/interactions") && method === "POST") {
    if (!caps.campaigns || !caps.wallet) return unavailable("??? ?????");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ????? ???? ???? ????." }, 401);
    const campaignId = path.slice("/api/campaigns/".length, -"/interactions".length);
    if (!UUID_RE.test(campaignId)) return json({ error: "????? ????? ??????? ???." }, 400);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const interactionType = typeof body.interaction_type === "string" ? body.interaction_type.trim().toLowerCase() : "";
    const clientKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim().slice(0, 120) : "";
    if (!ALLOWED_GOALS.has(interactionType)) return json({ error: "??? ????? ????? ????." }, 400);
    if (!clientKey) return json({ error: "???? ????? ??????? (idempotency_key) ???? ???." }, 400);

    const campaign = await db.prepare("SELECT id, user_id, goals_json, quota_per_goal, fulfilled_json, platform FROM campaigns WHERE id = ?").bind(campaignId).first();
    if (!campaign) return json({ error: "????? ???? ???." }, 404);
    if (campaign.user_id === user.id) return json({ error: "???? ????? ????????? ???? ????? ???? ????? ??? ???." }, 400);
    const goals = parseGoals(campaign.goals_json);
    if (!goals.includes(interactionType)) return json({ error: "??? ??? ????? ?? ????? ????? ????? ???? ???." }, 400);

    let fulfilled = {};
    try { fulfilled = campaign.fulfilled_json ? JSON.parse(campaign.fulfilled_json) : {}; } catch { fulfilled = {}; }
    const quota = Number(campaign.quota_per_goal) || CAMPAIGN_INTERACTION_QUOTA;
    const current = Number(fulfilled[interactionType] || 0);
    if (current >= quota) {
      return json({ error: "????? ??? ??? ????? ???? ????? ????? ??? ???.", interaction_type: interactionType, fulfilled: current, quota }, 409);
    }

    const campMeta = await db.prepare("SELECT content_url, duration_seconds FROM campaigns WHERE id = ?").bind(campaignId).first();
    const needWatch = Math.min(WATCH_REWARD_MAX_SECONDS, Math.max(1, Number(campMeta?.duration_seconds) || 1));
    const watchedOk = await hasCompletedWatch(db, user.id, campaignId, campMeta?.content_url || "", needWatch);
    if (!watchedOk) {
      return json({
        error: "???? ??? ??? ????? ???? ????? ???? ????? ?? ???? ?????? ? ????? ????? ?? ??? ????.",
        requires_full_watch: true,
        required_seconds: needWatch,
      }, 403);
    }

    // ??? ?????? ????? ???????? (?? ????? ????)
    if (!MEMBERSHIP_GOALS.has(interactionType) && interactionType !== "views") {
      const dayStart = tehranDayStartSql();
      const cnt = await db.prepare(
        `SELECT COUNT(*) AS n FROM wallet_ledger
         WHERE user_id = ? AND transaction_type = ? AND amount > 0 AND created_at >= ?`,
      ).bind(user.id, TX_TYPES.INTERACTION_REWARD, dayStart).first();
      const sum = await db.prepare(
        `SELECT COALESCE(SUM(amount),0) AS s FROM wallet_ledger
         WHERE user_id = ? AND transaction_type = ? AND amount > 0 AND created_at >= ?`,
      ).bind(user.id, TX_TYPES.INTERACTION_REWARD, dayStart).first();
      if ((cnt?.n || 0) >= INTERACTION_DAILY_COUNT_CAP) {
        return json({ error: "??? ????? ??????? ????????? ????? ????? ??? ???.", daily_count_cap: INTERACTION_DAILY_COUNT_CAP }, 429);
      }
      if ((sum?.s || 0) >= INTERACTION_DAILY_COIN_CAP) {
        return json({ error: "??? ???? ??????? ?? ??????? ????? ????? ??? ???.", daily_coin_cap: INTERACTION_DAILY_COIN_CAP }, 429);
      }
    }

    const giveMembershipReward = MEMBERSHIP_GOALS.has(interactionType);
    const durationForReward = Math.min(WATCH_REWARD_MAX_SECONDS, Math.max(1, Number(campMeta?.duration_seconds) || needWatch));
    const tableReward = calcInteractionReward(interactionType, durationForReward);
    const rewardCoins = tableReward;
    const memberKey = `member:${user.id}:${campaignId}:${interactionType}`;
    const idem = giveMembershipReward ? memberKey : `ix:${user.id}:${campaignId}:${interactionType}:${clientKey}`;

    // ---- ?????? ????? ----
    if (giveMembershipReward) {
      const limits = await membershipRateLimits(db, user.id);
      if (limits.hourly >= limits.hourly_cap) {
        return json({ error: "????? ??????????? ????? ?? ??? ???? ??? ?? ?? ???? ???? ??? ??? ?????? ???? ????.", ...limits }, 429);
      }
      if (limits.daily >= limits.daily_cap) {
        return json({ error: "??? ??????? ????? ????? ????? ??? ???.", ...limits }, 429);
      }
      // ?????? ?????: ?? ????? ????/???????? ???? ?? URL
      const campFull = await db.prepare("SELECT content_url FROM campaigns WHERE id = ?").bind(campaignId).first();
      if (campFull?.content_url && await hasActiveMembershipForContent(db, user.id, campFull.content_url)) {
        return json({ error: "???? ??? ????? ????? ????? ????? ???? ?? ?? ?????? ?????." }, 409);
      }
    }

    const existing = await db.prepare(
      "SELECT id, verification_status, reward_coins, created_at FROM video_watch_rewards WHERE user_id = ? AND idempotency_key = ?",
    ).bind(user.id, idem).first();

    if (existing && (existing.verification_status === "verified" || existing.verification_status === "pending")) {
      const balance = await getBalance(db, user.id);
      return json({
        ok: true,
        duplicate: true,
        interaction_type: interactionType,
        status: existing.verification_status,
        fulfilled: current,
        quota,
        reward_coins: 0,
        balance,
        message: existing.verification_status === "pending"
          ? "????? ??? ??? ? ?? ????? ????? ?????? ???? ?? ?? ?? ????? ????? ??????."
          : "??? ????? ????? ??? ? ????? ??? ???.",
      }, 200);
    }

    // cooldown ?? ?? ???
    if (existing && existing.verification_status === "rejected" && giveMembershipReward) {
      const cooldownMs = MEMBERSHIP_REJOIN_COOLDOWN_HOURS * 3600 * 1000;
      // ???? ??? ˜ ????? ???? ledger reversal ?? created ???? — ?? revoke debit timestamp
      const lastRev = await db.prepare(
        "SELECT created_at FROM wallet_ledger WHERE user_id = ? AND idempotency_key LIKE ? ORDER BY created_at DESC LIMIT 1",
      ).bind(user.id, `member_revoke:${memberKey}%`).first();
      const anchor = lastRev?.created_at || existing.created_at;
      const t = Date.parse(String(anchor).replace(" ", "T") + (String(anchor).endsWith("Z") ? "" : "Z"));
      if (Number.isFinite(t) && Date.now() - t < cooldownMs) {
        const waitH = Math.ceil((cooldownMs - (Date.now() - t)) / 3600000);
        return json({ error: `?? ?? ??? ?????? ${waitH} ???? ?? ??? ???? ??? ???? ????? ???? ???.` }, 429);
      }
    }

    try {
      const campUrl = (await db.prepare("SELECT content_url FROM campaigns WHERE id = ?").bind(campaignId).first())?.content_url || "";
      const stmts = [];
      // ?????: ????? pending ???? ?????? ????????: settled ???? ?????
      const initialStatus = giveMembershipReward ? "pending" : "verified";
      if (existing && existing.verification_status === "rejected") {
        stmts.push(
          db.prepare("UPDATE video_watch_rewards SET verification_status = ?, reward_coins = ?, watched_seconds = 1, content_url = ?, created_at = CURRENT_TIMESTAMP WHERE id = ? AND verification_status = 'rejected'")
            .bind(initialStatus, rewardCoins, campUrl, existing.id),
        );
      } else {
        stmts.push(
          db.prepare(`INSERT INTO video_watch_rewards (id, user_id, campaign_id, content_url, watched_seconds, reward_coins, verification_status, idempotency_key)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
            .bind(crypto.randomUUID(), user.id, campaignId, campUrl, rewardCoins, initialStatus, idem),
        );
      }
      // ???????? ?? ????? ????: ????? ???? ?????: pending ? ????? ?? Cron
      if (!giveMembershipReward && rewardCoins > 0) {
        stmts.push(buildCreditStmt(db, {
          userId: user.id,
          amount: rewardCoins,
          type: TX_TYPES.INTERACTION_REWARD,
          description: `????? ????? ${interactionType} ?? ?? ?????? ????`,
          idempotencyKey: `ixrw:${idem}`,
          referenceType: "campaign",
          referenceId: campaignId,
        }));
      }
      await db.batch(stmts);
      fulfilled[interactionType] = current + 1;
      await db.prepare("UPDATE campaigns SET fulfilled_json = ? WHERE id = ?").bind(JSON.stringify(fulfilled), campaignId).run();
    } catch (err) {
      if (isUniqueViolation(err)) {
        const balance = await getBalance(db, user.id);
        return json({ ok: true, duplicate: true, interaction_type: interactionType, fulfilled: current, quota, reward_coins: 0, balance, message: "??? ????? ????? ??? ??? ???." }, 200);
      }
      console.error("interaction record failed");
      return json({ error: "??? ????? ????? ???." }, 500);
    }
    const balance = await getBalance(db, user.id);
    return json({
      ok: true,
      interaction_type: interactionType,
      fulfilled: fulfilled[interactionType],
      quota,
      reward_coins: giveMembershipReward ? 0 : rewardCoins,
      reward_pending: giveMembershipReward,
      hold_hours: giveMembershipReward ? MEMBERSHIP_HOLD_HOURS : 0,
      pending_reward_coins: giveMembershipReward ? rewardCoins : 0,
      interaction_reward_range: INTERACTION_REWARD_RANGE,
      duration_seconds_used: durationForReward,
      balance,
      message: giveMembershipReward
        ? `????? ??? ??. ${rewardCoins} ???? ?? ?? ${MEMBERSHIP_HOLD_HOURS} ???? ????? ? ?? ???? ?????? ????? ????? ??????.`
        : (rewardCoins > 0
          ? `????? ??? ?? ? ${rewardCoins} ???? ?? ??? ??? ????? ??.`
          : "????? ??? ??. ???? ??????? ????? ???? ?? ???? ?????? ???? ????? ????? ??????."),
    }, 201);
  }

  if (path.startsWith("/api/campaigns/") && path.endsWith("/interactions/revoke") && method === "POST") {
    if (!caps.campaigns || !caps.wallet) return unavailable("??? ?????");
    const user = await requireUser(db, request, env);
    if (!user) return json({ error: "???? ????? ???? ???? ????." }, 401);
    const campaignId = path.slice("/api/campaigns/".length, -"/interactions/revoke".length);
    if (!UUID_RE.test(campaignId)) return json({ error: "????? ????? ??????? ???." }, 400);
    const body = await readJson(request);
    if (!body) return json({ error: "??????? ?????? ????? ????." }, 400);
    const interactionType = typeof body.interaction_type === "string" ? body.interaction_type.trim().toLowerCase() : "";
    if (!MEMBERSHIP_GOALS.has(interactionType)) {
      return json({ error: "?????????? ??? ???? ????? ????????? ? ????? ????? ????? ??????." }, 400);
    }

    const campaign = await db.prepare("SELECT id, fulfilled_json FROM campaigns WHERE id = ?").bind(campaignId).first();
    if (!campaign) return json({ error: "????? ???? ???." }, 404);

    const memberKey = `member:${user.id}:${campaignId}:${interactionType}`;
    const rewardRow = await db.prepare(
      "SELECT id, reward_coins, verification_status FROM video_watch_rewards WHERE user_id = ? AND idempotency_key = ?",
    ).bind(user.id, memberKey).first();

    if (!rewardRow || rewardRow.verification_status === "rejected") {
      const balance = await getBalance(db, user.id);
      return json({
        ok: true,
        already_revoked: true,
        interaction_type: interactionType,
        clawback_coins: 0,
        balance,
        message: "????? ????? ???? ?????????? ???? ???.",
      }, 200);
    }

    const prevStatus = rewardRow.verification_status; // pending | verified
    const clawback = prevStatus === "verified" ? (Number(rewardRow.reward_coins) || MEMBERSHIP_REWARD_COINS) : 0;
    const revokeDebitKey = `member_revoke:${memberKey}:${rewardRow.id}`;

    const mark = await db.prepare(
      "UPDATE video_watch_rewards SET verification_status = 'rejected' WHERE id = ? AND verification_status IN ('pending','verified')",
    ).bind(rewardRow.id).run();
    if (!((mark.meta?.changes || 0) > 0)) {
      const balance = await getBalance(db, user.id);
      return json({ ok: true, already_revoked: true, interaction_type: interactionType, clawback_coins: 0, balance, message: "??? ????? ????? ??? ??? ???." }, 200);
    }

    // ???? ????? ?????
    let fulfilled = {};
    try { fulfilled = campaign.fulfilled_json ? JSON.parse(campaign.fulfilled_json) : {}; } catch { fulfilled = {}; }
    const cur = Number(fulfilled[interactionType] || 0);
    if (cur > 0) {
      fulfilled[interactionType] = cur - 1;
      await db.prepare("UPDATE campaigns SET fulfilled_json = ? WHERE id = ?").bind(JSON.stringify(fulfilled), campaignId).run();
    }

    // pending: ???? ????? ????? ???? ? ??? ??? ?????
    if (prevStatus === "pending") {
      const balance = await getBalance(db, user.id);
      return json({
        ok: true,
        interaction_type: interactionType,
        clawback_coins: 0,
        clawback_applied: true,
        status_was: "pending",
        fulfilled: fulfilled[interactionType] || 0,
        balance,
        message: "????? ?? ????? ????? ??? ??? ??? ????? ???? ????? ???? ???? ???? ?? ??? ??? ????? ???.",
      }, 200);
    }

    // verified: ?????????? ?? ??? ???
    let applied = false;
    if (clawback > 0) {
      const credited = await db.prepare(
        "SELECT id FROM wallet_ledger WHERE user_id = ? AND reference_type = 'campaign' AND reference_id = ? AND transaction_type = ? AND amount > 0 AND idempotency_key LIKE ? ORDER BY created_at DESC LIMIT 1",
      ).bind(user.id, campaignId, TX_TYPES.WATCH_REWARD, `member_credit:${memberKey}%`).first();
      if (credited) {
        const debit = await debitCoins(db, {
          userId: user.id,
          amount: clawback,
          type: TX_TYPES.REVERSAL,
          description: `?????????? ????? ????? (${interactionType})`,
          idempotencyKey: revokeDebitKey,
          referenceType: "campaign",
          referenceId: campaignId,
        });
        applied = debit.applied;
        if (!applied) {
          // ??? ???? ?? ??? ?????? ???? ???? ????
          const bal = await getBalance(db, user.id);
          if (bal > 0) {
            const partial = await debitCoins(db, {
              userId: user.id,
              amount: bal,
              type: TX_TYPES.REVERSAL,
              description: `?????????? ???? ????? ????? (${interactionType})`,
              idempotencyKey: `${revokeDebitKey}:partial`,
              referenceType: "campaign",
              referenceId: campaignId,
            });
            applied = partial.applied;
          }
          const balance = await getBalance(db, user.id);
          return json({
            ok: true,
            interaction_type: interactionType,
            clawback_coins: clawback,
            clawback_applied: applied,
            partial: true,
            balance,
            message: "????? ??? ??? ?????? ???? ??? ???? ???? ???? ? ?????? ???? ??? ??.",
          }, 200);
        }
      }
    }

    const balance = await getBalance(db, user.id);
    return json({
      ok: true,
      interaction_type: interactionType,
      clawback_coins: clawback,
      clawback_applied: applied || clawback === 0,
      status_was: "verified",
      fulfilled: fulfilled[interactionType] || 0,
      balance,
      message: `????? ??? ?? ? ${clawback} ???? ?? ??? ??? ??? ?????.`,
    }, 200);
  }

  return json({ error: "???? ??????? ???? ???." }, 404);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "???? ??????? ???? ????." }, 403, headers);
    try {
      const response = await handle(request, env);
      const merged = new Headers(response.headers);
      for (const [k, v] of Object.entries({ ...headers, ...SECURITY_HEADERS })) merged.set(k, v);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
    } catch (err) {
      console.error("unhandled request error");
      return json({ error: "???? ????? ???? ?? ???." }, 500, { ...headers, ...SECURITY_HEADERS });
    }
  },
  // Cron Trigger: ??????? ?????????? ????? ??? ?????? ???????????? ???? ???????.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      await reconcilePendingPayments(env).catch(() => console.error("payment reconciliation failed"));
      if (env.DB) {
        const schema = await ensureSchema(env.DB);
        if (schema.capabilities?.wallet) {
          await settleMembershipRewards(env.DB).catch(() => console.error("membership settlement failed"));
        }
      }
    })());
  },
};