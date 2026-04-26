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
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Dev only
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              假扮使用者（本機測試用）
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              一鍵建立 3 個測試帳號並切換 session，用來測建局/加入/候補/確認。
            </p>
          </div>
          <Link
            href="/games"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-zinc-300 px-4 py-2.5 text-base font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:text-sm dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
          >
            回牌局
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:mt-8 sm:p-6">
          <p className="text-sm font-medium">目前 session</p>
          <p className="mt-2 break-all text-sm text-zinc-700 dark:text-zinc-200">
            {session
              ? `${session.displayName} (${session.provider}:${session.providerUserId})`
              : "（未登入）"}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <form action={signOutAction} className="w-full sm:w-auto">
              <button
                type="submit"
                className="min-h-11 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-base font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:w-auto sm:py-2 sm:text-sm dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
              >
                清除 session
              </button>
            </form>
            <form action={ensureAction} className="w-full sm:w-auto">
              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:min-h-0 sm:w-auto sm:py-2 sm:text-sm"
              >
                建立/更新 dev 帳號
              </button>
            </form>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4">
          {[
            { id: "host", label: "切換：主辦" },
            { id: "player_a", label: "切換：玩家A" },
            { id: "player_b", label: "切換：玩家B" },
          ].map((item) => (
            <form key={item.id} action={switchAction}>
              <input type="hidden" name="identity" value={item.id} />
              <button
                type="submit"
                className="min-h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base font-medium text-zinc-900 shadow-sm transition active:bg-zinc-100 sm:min-h-0 sm:py-4 sm:text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:active:bg-zinc-800"
              >
                {item.label}
              </button>
            </form>
          ))}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 sm:mt-8">
          這個頁面只在 <code>NODE_ENV=development</code> 可用，上線環境不會暴露。
        </p>
      </main>
    </div>
  );
}

