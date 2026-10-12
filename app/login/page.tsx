import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/dashboard/LoginForm";
import { VeraLogo } from "@/components/VeraLogo";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
};

// Force dynamic rendering so Next doesn't try to prerender this page at
// build time. LoginForm uses useSearchParams() (for ?next=...); even with
// a Suspense boundary, Next 16's static prerender path on Vercel was
// throwing an opaque runtime error here that my local `npm run build`
// didn't reproduce. Marking the page dynamic skips prerender entirely —
// fine for an auth page that no one should be visiting cold from search.
export const dynamic = "force-dynamic";

// theme-light: auth chrome always renders light (the user's dashboard
// theme applies after sign-in). Restyled 2026-07-15 — the old dark
// "Operator access" card was the last of the pre-rebrand UI.
export default function LoginPage() {
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
          <h1 className="mb-7 font-display text-[1.4rem] font-medium tracking-tight text-text-primary">
            Sign in to your dashboard
          </h1>

          {/* Suspense is required: LoginForm uses useSearchParams() which
              bails the page out of static prerendering unless wrapped. */}
          <Suspense fallback={<div className="h-[180px]" aria-hidden />}>
            <LoginForm />
          </Suspense>
        </div>

      </div>
    </main>
  );
}
