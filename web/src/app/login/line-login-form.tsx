"use client";

import { useMemo, useState } from "react";

type Props = {
  nextPath: string;
  errorMessage: string | null;
  /** false 時按鈕停用（例如尚未設定 .env.local） */
  disabled?: boolean;
};

export function LineLoginForm({
  nextPath,
  errorMessage,
  disabled = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const href = useMemo(() => {
    const params = new URLSearchParams();
    params.set("next", nextPath);
    return `/auth/line/start?${params.toString()}`;
  }, [nextPath]);

  function signInWithLine() {
    setLoading(true);
    setLocalError(null);
    window.location.assign(href);
  }

  const showError = errorMessage ?? localError;

  return (
    <div className="space-y-6">
      {showError ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {showError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void signInWithLine()}
        disabled={loading || disabled}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-medium text-white shadow-sm transition active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: "#06C755" }}
      >
        {loading ? (
          "導向 LINE…"
        ) : (
          <>
            <LineIcon className="h-6 w-6 shrink-0" aria-hidden />
            使用 LINE 登入
          </>
        )}
      </button>

      <p className="text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        登入即表示你同意本站服務條款與隱私權政策（上線前請補齊法務文件）。
      </p>
    </div>
  );
}

function LineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.921c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.345.28-.63.63-.63.216 0 .406.107.517.271l2.462 3.34V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.626-.285-.626-.629V8.108c0-.345.281-.63.63-.63.346 0 .627.285.627.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.63.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.084.923.258 1.065.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}
