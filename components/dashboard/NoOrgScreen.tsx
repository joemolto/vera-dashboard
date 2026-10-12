"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function NoOrgScreen({ email }: { email: string }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-6 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg-elevated text-text-muted">
          <ShieldAlert size={20} strokeWidth={1.7} />
        </div>
        <h1 className="mt-6 font-display text-[1.4rem] font-medium tracking-tight text-text-primary">
          No organisation linked
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          {email} isn&apos;t linked to an organisation yet. The operator of
          this install can create one with the engine&apos;s setup script,{" "}
          <span className="text-text-primary">scripts/create_org.py</span>.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-7 rounded-lg border border-border-default px-4 py-2 text-[13px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
