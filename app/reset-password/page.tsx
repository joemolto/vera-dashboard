import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VeraLogo } from "@/components/VeraLogo";
import { ResetPasswordForm } from "@/components/dashboard/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

// theme-light: auth chrome always renders light to match the marketing
// site, same as /login (restyled 2026-07-15).
export default function ResetPasswordPage() {
  return (
    <main className="theme-light relative min-h-screen overflow-hidden bg-bg-base">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16">
        <Link
          href="/"
          aria-label="Vera home"
          className="mb-10 -mx-2 inline-block px-2"
        >
          <VeraLogo size="md" showMark />
        </Link>

        <div className="w-full rounded-2xl border border-border-default bg-bg-card p-8 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.25)]">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>

        <Link
          href="/login"
          className="mt-6 text-[12.5px] text-text-muted transition-colors hover:text-text-secondary"
        >
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
