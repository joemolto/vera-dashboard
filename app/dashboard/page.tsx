import { HomeRouter } from "@/components/dashboard/widgets/HomeRouter";

export default function HomePage() {
  // Per-org branching lives in HomeRouter (client component) since
  // features.home_v2 is read from OrgContext. Default path renders
  // the legacy VeraBrief + ActOnToday + UnifiedTimeline stack;
  // Opt-in orgs get the newer HomeV2 layout instead.
  return <HomeRouter />;
}
