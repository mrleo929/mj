import { createAdminClient } from "@/lib/supabase/admin";

type DevIdentity = "host" | "player_a" | "player_b";

function assertDev() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("dev impersonation 僅限本機開發環境使用");
  }
}

function devEmail(identity: DevIdentity) {
  return `dev_${identity}@users.mj.invalid`;
}

function devDisplayName(identity: DevIdentity) {
  switch (identity) {
    case "host":
      return "測試主辦";
    case "player_a":
      return "測試玩家A";
    case "player_b":
      return "測試玩家B";
  }
}

export async function ensureDevProfiles(): Promise<Record<DevIdentity, string>> {
  assertDev();
  const admin = createAdminClient();

  const identities: DevIdentity[] = ["host", "player_a", "player_b"];
  const result: Partial<Record<DevIdentity, string>> = {};

  for (const identity of identities) {
    // 先找既有 profile
    const existing = await admin
      .from("profiles")
      .select("id")
      .eq("provider", "dev")
      .eq("provider_user_id", identity)
      .maybeSingle();

    if (existing.data?.id) {
      result[identity] = existing.data.id as string;
      continue;
    }

    const created = await admin.auth.admin.createUser({
      email: devEmail(identity),
      email_confirm: true,
      user_metadata: {
        display_name: devDisplayName(identity),
        provider: "dev",
        provider_user_id: identity,
      },
    });

    if (created.error || !created.data.user) {
      throw new Error(
        `建立 dev 使用者失敗(${identity})：${created.error?.message ?? "unknown"}`,
      );
    }

    const userId = created.data.user.id;

    const upsert = await admin.from("profiles").upsert(
      {
        id: userId,
        display_name: devDisplayName(identity),
        avatar_url: null,
        provider: "dev",
        provider_user_id: identity,
      },
      { onConflict: "id" },
    );

    if (upsert.error) {
      throw new Error(`寫入 dev profile 失敗(${identity})：${upsert.error.message}`);
    }

    result[identity] = userId;
  }

  return result as Record<DevIdentity, string>;
}

export async function getDevProfile(identity: DevIdentity) {
  assertDev();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id,display_name,avatar_url,provider_user_id")
    .eq("provider", "dev")
    .eq("provider_user_id", identity)
    .single();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    display_name: string;
    avatar_url: string | null;
    provider_user_id: string;
  };
}

