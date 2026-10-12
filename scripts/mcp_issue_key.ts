/**
 * Admin: issue a Vera MCP API key for a customer org.
 *
 * Usage:
 *   npx tsx scripts/mcp_issue_key.ts --org <uuid> --name "Acme Slack Bot"
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 *
 * The generated token is printed ONCE. It cannot be retrieved later
 * (only the sha256 hash is persisted). Hand it to the customer over a
 * secure channel; they paste it into their MCP client config as the
 * Bearer token for <NEXT_PUBLIC_APP_URL>/api/mcp.
 *
 * Rotation: run again with the same name and the old key is left
 * intact (we don't auto-revoke). To revoke, run with --revoke <key_id>.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const db = createClient(url, serviceKey);

  const revokeId = arg("revoke");
  if (revokeId) {
    const { error } = await db
      .from("mcp_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", revokeId);
    if (error) {
      console.error("Revoke failed:", error.message);
      process.exit(1);
    }
    console.log(`Revoked key ${revokeId}.`);
    return;
  }

  const orgId = arg("org");
  const name = arg("name");
  if (!orgId || !name) {
    console.error("Usage: --org <uuid> --name <human label>   |  --revoke <key_id>");
    process.exit(1);
  }

  // 32 random bytes → 64-char hex. Prefixed "vera_" for identifiability
  // in logs / customer agent configs.
  const rawToken = `vera_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawToken).digest("hex");
  const keyPrefix = rawToken.slice(0, 12);

  const { data, error } = await db
    .from("mcp_api_keys")
    .insert({
      org_id: orgId,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
    })
    .select("id")
    .limit(1);
  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log("");
  console.log("MCP API key issued.");
  console.log("--------------------------------------------------------");
  console.log(`  Key ID:    ${data?.[0]?.id}`);
  console.log(`  Org:       ${orgId}`);
  console.log(`  Name:      ${name}`);
  console.log(`  Prefix:    ${keyPrefix}`);
  console.log("");
  console.log("  Token (shown ONCE — record now):");
  console.log("");
  console.log(`    ${rawToken}`);
  console.log("");
  console.log("--------------------------------------------------------");
  console.log("Customer config:");
  console.log(
    `  Endpoint:  ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/mcp`,
  );
  console.log("  Header:    Authorization: Bearer <token>");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
