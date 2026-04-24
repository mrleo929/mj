"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { user: User };

export function LoggedInPanel({ user }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const label =
    user.user_metadata?.name ??
    user.user_metadata?.full_name ??
    user.email ??
    user.phone ??
    "已登入";

  async function signOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <div className="space-y-6 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">目前狀態</p>
      <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        {label}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/"
          className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          回到首頁
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={loading}
          className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {loading ? "登出中…" : "登出"}
        </button>
      </div>
    </div>
  );
}
