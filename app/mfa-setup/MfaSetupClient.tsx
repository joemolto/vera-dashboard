"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { MfaEnroll } from "@/components/dashboard/widgets/MfaEnroll";

export function MfaSetupClient() {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-border-default bg-bg-card p-7 md:p-8">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={20} className="text-accent" strokeWidth={1.8} />
          <h1 className="text-[18px] font-semibold tracking-tight text-text-primary">
            Secure your account
          </h1>
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
          Vera protects sensitive account intelligence, so two-factor
          authentication is required. It takes about 30 seconds and you only
          do it once.
        </p>
        <div className="mt-6">
          <MfaEnroll
            onComplete={() => {
              router.replace("/dashboard");
              router.refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}
