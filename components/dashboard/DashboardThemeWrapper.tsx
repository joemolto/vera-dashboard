"use client";

/**
 * DashboardThemeWrapper — applies the premium `.theme-light` palette to
 * intelligence-only orgs, but ONLY while the chosen theme is light. When
 * the user switches to dark in Settings, we drop `.theme-light` so the
 * dashboard falls through to the global dark tokens — otherwise
 * `.theme-light` would override `.dark` and the toggle would do nothing.
 *
 * Defaults to light (matching the server render) so there's no flash for
 * these orgs; reacts to the ThemeChooser, which toggles `.dark` on
 * <html> + persists `theme` to localStorage.
 */

import { useEffect, useState } from "react";

export function DashboardThemeWrapper({
  intelligenceOnly,
  children,
}: {
  intelligenceOnly: boolean;
  children: React.ReactNode;
}) {
  const [dark, setDark] = useState(false); // light by default (server parity)

  useEffect(() => {
    const read = () =>
      setDark(document.documentElement.classList.contains("dark"));
    read();
    // The ThemeChooser toggles the `dark` class on <html>; watch for it.
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("storage", read);
    return () => {
      obs.disconnect();
      window.removeEventListener("storage", read);
    };
  }, []);

  const light = intelligenceOnly && !dark;
  return <div className={light ? "theme-light" : undefined}>{children}</div>;
}
