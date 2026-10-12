import { redirect } from "next/navigation";

// Feed merged into Home: watchlist alerts live in WatchlistIntel and
// threat alerts now surface in ActiveThreatAlerts on the home page.
// Kept as a redirect so any bookmarked /dashboard/feed URLs still land
// somewhere useful.
export default function FeedRedirect() {
  redirect("/dashboard");
}
