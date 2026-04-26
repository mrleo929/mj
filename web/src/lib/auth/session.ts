import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "mj_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type SessionUser = {
  provider: "line";
  profileId: string;
  providerUserId: string;
  displayName: string;
  avatarUrl?: string | null;
};

type SessionPayload = {
  v: 1;
  iat: number;
  exp: number;
  user: SessionUser;
};

function getSessionSecret(): string {
  const secret = process.env.MJ_SESSION_SECRET ?? "";
  if (!secret) {
    throw new Error("缺少 MJ_SESSION_SECRET（用於簽發登入 cookie）");
  }
  return secret;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return Buffer.from(bin, "binary")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const buf = Buffer.from(padded, "base64");
  return new Uint8Array(buf);
}

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(sig);
}

async function sign(payload: SessionPayload): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" } as const;
  const encodedHeader = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(header)),
  );
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const sig = await hmacSha256(getSessionSecret(), signingInput);
  const encodedSig = bytesToBase64Url(sig);
  return `${signingInput}.${encodedSig}`;
}

async function verify(token: string): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const signingInput = `${h}.${p}`;
  const expected = await hmacSha256(getSessionSecret(), signingInput);
  const actual = base64UrlToBytes(s);
  if (actual.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(p)),
    ) as SessionPayload;
    if (payload.v !== 1) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionUser(user: SessionUser) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    user,
  };
  const token = await sign(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verify(token);
  return payload?.user ?? null;
}

