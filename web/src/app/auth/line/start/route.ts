import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { randomBase64Url, sha256Base64Url } from "@/lib/auth/pkce";

const STATE_COOKIE = "mj_line_state";
const VERIFIER_COOKIE = "mj_line_verifier";

function getLineConfig() {
  const channelId = process.env.LINE_CHANNEL_ID ?? "";
  const redirectUri = process.env.LINE_REDIRECT_URI ?? "";
  if (!channelId) throw new Error("缺少 LINE_CHANNEL_ID");
  if (!redirectUri) throw new Error("缺少 LINE_REDIRECT_URI");
  return { channelId, redirectUri };
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const nextPath = safeNextPath(searchParams.get("next"));
  const { channelId, redirectUri } = getLineConfig();

  const state = randomBase64Url(24);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const authUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", channelId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // 把 nextPath 打包到 state 的另一個 query（避免 state 過長）；nextPath 本身仍會在 callback 讀 query
  authUrl.searchParams.set("nonce", randomBase64Url(16));

  const response = NextResponse.redirect(authUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };

  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE, codeVerifier, cookieOptions);
  response.cookies.set("mj_line_next", nextPath, {
    ...cookieOptions,
    httpOnly: true,
  });

  // 若 LINE_REDIRECT_URI 沒設成同站 callback，很容易填錯；附帶提示用（不影響流程）
  response.headers.set("x-mj-origin", origin);
  return response;
}

