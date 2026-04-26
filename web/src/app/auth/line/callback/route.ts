import { NextResponse, type NextRequest } from "next/server";
import { setSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createAdminClient } from "@/lib/supabase/admin";

const STATE_COOKIE = "mj_line_state";
const VERIFIER_COOKIE = "mj_line_verifier";
const NEXT_COOKIE = "mj_line_next";

function getLineConfig() {
  const channelId = process.env.LINE_CHANNEL_ID ?? "";
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
  const redirectUri = process.env.LINE_REDIRECT_URI ?? "";
  if (!channelId) throw new Error("缺少 LINE_CHANNEL_ID");
  if (!channelSecret) throw new Error("缺少 LINE_CHANNEL_SECRET");
  if (!redirectUri) throw new Error("缺少 LINE_REDIRECT_URI");
  return { channelId, channelSecret, redirectUri };
}

type LineTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  id_token?: string;
  refresh_token?: string;
};

type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

async function exchangeCodeForToken(params: {
  code: string;
  codeVerifier: string;
}) {
  const { channelId, channelSecret, redirectUri } = getLineConfig();
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", params.code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", channelId);
  body.set("client_secret", channelSecret);
  body.set("code_verifier", params.codeVerifier);

  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE token 交換失敗：${res.status} ${text}`);
  }

  return (await res.json()) as LineTokenResponse;
}

async function fetchProfile(accessToken: string) {
  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE profile 取得失敗：${res.status} ${text}`);
  }
  return (await res.json()) as LineProfile;
}

async function ensureProfile(params: {
  providerUserId: string;
  displayName: string;
  avatarUrl?: string | null;
}) {
  const admin = createAdminClient();

  // 先找既有 profiles（用 provider/provider_user_id 綁定）
  const existing = await admin
    .from("profiles")
    .select("id")
    .eq("provider", "line")
    .eq("provider_user_id", params.providerUserId)
    .maybeSingle();

  if (existing.data?.id) {
    // 同步顯示資訊（display_name / avatar_url）
    await admin
      .from("profiles")
      .update({
        display_name: params.displayName,
        avatar_url: params.avatarUrl ?? null,
      })
      .eq("id", existing.data.id);

    return existing.data.id;
  }

  // 建立 auth.users（用不可投遞的假 email 當唯一鍵），讓既有 profiles FK 與 trigger 能正常工作
  const fakeEmail = `line_${params.providerUserId}@users.mj.invalid`;
  const created = await admin.auth.admin.createUser({
    email: fakeEmail,
    email_confirm: true,
    user_metadata: {
      display_name: params.displayName,
      avatar_url: params.avatarUrl ?? null,
      provider: "line",
      provider_user_id: params.providerUserId,
    },
  });

  if (created.error || !created.data.user) {
    throw new Error(
      `建立 Supabase 使用者失敗：${created.error?.message ?? "unknown"}`,
    );
  }

  const userId = created.data.user.id;

  // 觸發器可能已插入 profiles（只有 display_name），這裡用 upsert 補齊 provider 資訊與頭像
  const upsert = await admin.from("profiles").upsert(
    {
      id: userId,
      display_name: params.displayName,
      avatar_url: params.avatarUrl ?? null,
      provider: "line",
      provider_user_id: params.providerUserId,
    },
    { onConflict: "id" },
  );

  if (upsert.error) {
    throw new Error(`寫入 profiles 失敗：${upsert.error.message}`);
  }

  return userId;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const codeVerifier = request.cookies.get(VERIFIER_COOKIE)?.value ?? "";
  const nextFromCookie = request.cookies.get(NEXT_COOKIE)?.value ?? "/";
  const nextFromQuery = safeNextPath(url.searchParams.get("next"));
  const nextPath = nextFromQuery !== "/" ? nextFromQuery : safeNextPath(nextFromCookie);

  if (!code || !returnedState) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("缺少 LINE 授權碼或 state")}`,
        url.origin,
      ),
    );
  }

  if (!cookieState || cookieState !== returnedState) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("state 不符，請重試登入")}`,
        url.origin,
      ),
    );
  }

  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("缺少 PKCE verifier，請重試登入")}`,
        url.origin,
      ),
    );
  }

  try {
    const token = await exchangeCodeForToken({ code, codeVerifier });
    const profile = await fetchProfile(token.access_token);

    const profileId = await ensureProfile({
      providerUserId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.pictureUrl ?? null,
    });

    await setSessionUser({
      provider: "line",
      profileId,
      providerUserId: profile.userId,
      displayName: profile.displayName,
      avatarUrl: profile.pictureUrl ?? null,
    });

    const response = NextResponse.redirect(new URL(nextPath, url.origin));
    // 清除一次性 cookie
    const clear = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 0,
    };
    response.cookies.set(STATE_COOKIE, "", clear);
    response.cookies.set(VERIFIER_COOKIE, "", clear);
    response.cookies.set(NEXT_COOKIE, "", clear);
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "LINE 登入失敗";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, url.origin),
    );
  }
}

