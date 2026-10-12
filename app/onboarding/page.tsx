import { redirect } from "next/navigation";

// Onboarding now happens as a modal over the dashboard (SoloOnboardingModal),
// not a standalone page. This route is retired — send anyone who lands here
// to the dashboard, where the modal takes over if onboarding is pending.
export default function OnboardingPage() {
  redirect("/dashboard");
}
