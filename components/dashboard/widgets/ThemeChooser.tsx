"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Palette } from "lucide-react";
import {
  Card,
  SectionHeader,
} from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

/**
 * Settings-page theme chooser. Same underlying mechanism as the
 * marketing-site AnimatedThemeToggler (toggle the `dark` class on
 * <html> and persist to localStorage), but presented as a labelled
 * segmented control instead of an icon-only button.
 */
export function ThemeChooser() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
  }, []);

  function applyTheme(next: Theme) {
    if (next === theme) return;
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* localStorage may be blocked — UI still updates this session */
    }
  }

  return (
    <Card delay={0.18} className="p-6 md:p-7">
      <SectionHeader title="Appearance" />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-text-secondary">
          <Palette size={16} strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[14.5px] font-medium tracking-tight text-text-primary">
            Theme
          </div>
          <div className="mt-0.5 text-[12px] text-text-muted">
            Switch between light and dark mode
          </div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-6 inline-flex rounded-lg border border-border-default bg-bg-elevated/40 p-1"
      >
        <ThemeOption
          label="Light"
          Icon={Sun}
          selected={theme === "light"}
          onClick={() => applyTheme("light")}
        />
        <ThemeOption
          label="Dark"
          Icon={Moon}
          selected={theme === "dark"}
          onClick={() => applyTheme("dark")}
        />
      </div>
    </Card>
  );
}

function ThemeOption({
  label,
  Icon,
  selected,
  onClick,
}: {
  label: string;
  Icon: typeof Sun;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium tracking-tight transition-colors",
        selected
          ? "bg-bg-card text-text-primary shadow-[0_2px_6px_-2px_rgba(0,0,0,0.2)]"
          : "text-text-muted hover:text-text-secondary",
      )}
    >
      <Icon size={13} strokeWidth={1.7} />
      {label}
    </button>
  );
}
