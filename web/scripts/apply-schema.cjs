/**
 * 將 initial_schema.sql 套用到 Supabase Postgres。
 * 需在 web/.env.local 設定 DATABASE_URI（見 README）。
 */
const path = require("path");
const fs = require("fs");
const { Client } = require("pg");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  quiet: true,
});

const sqlPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260125000000_initial_schema.sql",
);

function trimConn(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function describeConn(connStr) {
  try {
    const u = new URL(connStr);
    return {
      user: u.username || "(無)",
      host: u.hostname,
      port: u.port || "5432",
      hasPassword: Boolean(u.password),
    };
  } catch {
    return null;
  }
}

function pickConnectionString() {
  const uri = trimConn(process.env.DATABASE_URI);
  if (uri) return { conn: uri, envKey: "DATABASE_URI" };
  const url = trimConn(process.env.DATABASE_URL);
  if (url) return { conn: url, envKey: "DATABASE_URL" };
  const pg = trimConn(process.env.POSTGRES_URL);
  if (pg) return { conn: pg, envKey: "POSTGRES_URL" };
  return { conn: "", envKey: null };
}

async function main() {
  const { conn, envKey } = pickConnectionString();
  if (!conn) {
    console.error(
      "缺少資料庫連線字串：請在 web/.env.local 設定 DATABASE_URI（Supabase → Connect → Connection string → URI）。",
    );
    process.exit(1);
  }

  const info = describeConn(conn);
  if (info) {
    console.error(
      `（除錯）使用變數：${envKey} → 使用者「${info.user}」主機「${info.host}」埠「${info.port}」已帶密碼：${info.hasPassword ? "是" : "否"}`,
    );
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({
    connectionString: conn,
    ssl: conn.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ 已執行", path.basename(sqlPath));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const msg = err.message || String(err);
  console.error(msg);

  const { conn } = pickConnectionString();
  const info = conn ? describeConn(conn) : null;

  if (msg.includes("password authentication failed")) {
    console.error("\n── password authentication failed 常見原因 ──");
    console.error(
      "1. 密碼錯：到 Supabase → Project Settings → Database → Reset database password，重設後把 URI 裡密碼整段換新（不要留 [YOUR-PASSWORD]）。",
    );
    console.error(
      "2. 使用者名稱：若 URI 是 Pooler（常見埠 6543），使用者多半是 postgres.你的專案ref，不是單純 postgres。請回到 Connect → Connection string，選與「Direct / Session / Transaction」對應的那條再整條複製。",
    );
    console.error(
      "3. 密碼含 @ # % 等：在 URI 裡必須做 URL 編碼，或改設只含英數的密碼再重貼。",
    );
    console.error(
      "4. 建議試「Direct connection」那條（主機常為 db.xxxxx.supabase.co、使用者 postgres、埠 5432）專門給 migration／psql 用。",
    );
    if (info) {
      console.error(
        `\n你這次連線解析到：使用者=${info.user} 主機=${info.host} 埠=${info.port}`,
      );
    }
  }

  process.exit(1);
});
