import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { clearSession, getSessionUser, setSessionUser } from "@/lib/auth/session";
import { ensureDevProfiles, getDevProfile } from "@/lib/dev/impersonation";

async function ensureAction() {
  "use server";
  if (process.env.NODE_ENV !== "development") notFound();
  await ensureDevProfiles();
  redirect("/dev");
}

async function switchAction(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV !== "development") notFound();
  const identity = String(formData.get("identity") ?? "");
  if (!["host", "player_a", "player_b"].includes(identity)) {
    redirect("/dev");
  }
  await ensureDevProfiles();
  const profile = await getDevProfile(identity as "host" | "player_a" | "player_b");
  await setSessionUser({
    provider: "dev",
    profileId: profile.id,
    providerUserId: profile.provider_user_id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
  });
  redirect("/games");
}

async function signOutAction() {
  "use server";
  if (process.env.NODE_ENV !== "development") notFound();
  await clearSession();
  redirect("/dev");
}

export default async function DevImpersonationPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const session = await getSessionUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Dev only
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              假扮使用者（本機測試用）
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              一鍵建立 3 個測試帳號並切換 session，用來測建局/加入/候補/確認。
            </p>
          </div>
          <Link
            href="/games"
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            回牌局
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium">目前 session</p>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">
            {session
              ? `${session.displayName} (${session.provider}:${session.providerUserId})`
              : "（未登入）"}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                清除 session
              </button>
            </form>
            <form action={ensureAction}>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500"
              >
                建立/更新 dev 帳號
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { id: "host", label: "切換：主辦" },
            { id: "player_a", label: "切換：玩家A" },
            { id: "player_b", label: "切換：玩家B" },
          ].map((item) => (
            <form key={item.id} action={switchAction}>
              <input type="hidden" name="identity" value={item.id} />
              <button
                type="submit"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                {item.label}
              </button>
            </form>
          ))}
        </div>

        <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-400">
          這個頁面只在 <code>NODE_ENV=development</code> 可用，上線環境不會暴露。
        </p>
      </main>
    </div>
  );
}

