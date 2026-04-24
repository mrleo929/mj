# Mj 網頁版（mj-web）

Next.js（App Router）+ Supabase，麻將約局與牌品累積。

## 本機開發

1. 複製環境變數：

   ```bash
   cp .env.example .env.local
   ```

   在 [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API 填入 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

2. 建立資料庫物件（擇一）：
   - **A. 本機一鍵**：在 `web/.env.local` 新增 **`DATABASE_URI`**（Supabase Dashboard → **Connect** → 選 **ORM** 或 **Connection string** → 複製 **URI**，內含你建立專案時設的資料庫密碼）。然後在 `web/` 執行 **`npm run db:apply`**（只建議在新專案執行一次；若表或 policy 已存在可能報錯）。
   - **B. 手動**：Supabase → **SQL Editor**，貼上並執行 `supabase/migrations/20260125000000_initial_schema.sql`。

3. 安裝與啟動：

   ```bash
   npm install
   npm run dev
   ```

   瀏覽 <http://localhost:3000>。

## LINE 登入（Supabase）

1. 至 [LINE Developers Console](https://developers.line.biz/console/) 建立 **Provider**（LINE Login），取得 **Channel ID**、**Channel secret**。
2. 在 Channel 的 **Callback URL** 填入 Supabase 後台顯示的網址：  
   `https://<你的-project-ref>.supabase.co/auth/v1/callback`
3. Supabase Dashboard → **Authentication** → **Providers** → 啟用 **LINE**，貼上 Channel ID 與 Secret 並儲存。
4. 同一頁的 **URL Configuration**（或 Redirect URLs）中，將下列網址加入 **Redirect URLs** 清單：
   - 本機：`http://localhost:3000/auth/callback`
   - 正式站：`https://你的網域/auth/callback`
5. **Site URL** 建議設為 `http://localhost:3000`（本機）或你的正式網域首頁。

應用程式登入頁：<http://localhost:3000/login>。OAuth 完成後會導向 `/auth/callback` 以 **PKCE** 換取 session 並寫入 Cookie。

## Supabase 官方 CLI（已裝在專案內）

已執行 `supabase init`，設定檔在 `supabase/config.toml`。本機 Docker 堆疊需先安裝並啟動 **Docker Desktop**。

| 指令 | 說明 |
|------|------|
| `npm run supabase -- …` | 執行 CLI，例如 `npm run supabase -- --version` |
| `npm run db:local` | `supabase start`：本機起 Postgres、Auth、Studio 等 |
| `npm run db:local:stop` | `supabase stop` |
| `npm run db:local:status` | `supabase status` |
| `npm run db:types` | 自**本地** DB 產生 TypeScript 型別 → `src/types/database.types.ts`（須先 `db:local` 且 schema 已套用） |
| `npm run db:types:remote` | 自**雲端**連結專案產生型別（須先 `npx supabase login` 與 `npx supabase link`） |

雲端與本機 Postgres **大版本**應一致；若 `supabase start` 報版本不符，請在 `supabase/config.toml` 的 `[db]` → `major_version` 改成與雲端相同。

## 目錄說明

| 路徑 | 說明 |
|------|------|
| `src/lib/supabase/client.ts` | 瀏覽器端 Supabase 客戶端 |
| `src/lib/supabase/server.ts` | Server Component / Route Handler 用 |
| `src/lib/supabase/middleware.ts` | 刷新 Auth session |
| `src/middleware.ts` | Next.js middleware 入口 |
| `supabase/config.toml` | Supabase CLI 本機設定 |
| `supabase/migrations/` | SQL migration |
| `src/types/` | `npm run db:types` 產生的 DB 型別（可納入版控） |
| `src/app/login/` | LINE OAuth 登入頁 |
| `src/app/auth/callback/route.ts` | OAuth 回傳、交換 session |

## 技術版本

- Next.js 16、React 19、TypeScript、Tailwind CSS 4
