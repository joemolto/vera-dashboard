import { cn } from "@/lib/utils";

interface VeraLogoProps {
  className?: string;
  /** Render the "vera" wordmark beside the mark. Default true. */
  showWordmark?: boolean;
  /** Render the radar mark. Off by default — only the dashboard opts in;
      marketing + auth pages stay wordmark-only. */
  showMark?: boolean;
  size?: "sm" | "md" | "lg";
}

const textSize = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

const markSize = {
  sm: "h-[18px] w-[18px]",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function VeraLogo({
  className,
  size = "md",
  showWordmark = true,
  showMark = false,
}: VeraLogoProps) {
  return (
    <span className={cn("inline-flex select-none items-center gap-2", className)}>
      {/* Brand mark — the purple gradient monogram (2026-07 rebrand),
          matching the marketing site. */}
      {showMark && (
        <svg
          viewBox="0 0 1489.57 1273.43"
          aria-hidden="true"
          className={cn("shrink-0", markSize[size])}
        >
          <defs>
            <linearGradient id="vera-dash-mark-a" x1="867.93" y1="7510.62" x2="973.74" y2="6910.52" gradientTransform="matrix(1, 0, 0, -1, 0, 8173.04)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#c898ff" />
              <stop offset="1" stopColor="#a256f7" />
            </linearGradient>
            <linearGradient id="vera-dash-mark-b" x1="93.87" y1="7573.98" x2="592.24" y2="6980.05" gradientTransform="matrix(1, 0, 0, -1, 0, 8173.04)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#6123c2" />
              <stop offset="0.31" stopColor="#5f22bf" />
              <stop offset="0.53" stopColor="#5a1fb6" />
              <stop offset="0.72" stopColor="#5019a6" />
              <stop offset="0.9" stopColor="#431190" />
              <stop offset="1" stopColor="#390c80" />
            </linearGradient>
            <linearGradient id="vera-dash-mark-c" x1="500.68" y1="7461.33" x2="639.4" y2="8248.05" gradientTransform="matrix(1, 0, 0, -1, 0, 8173.04)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#c898ff" />
              <stop offset="1" stopColor="#a256f7" />
            </linearGradient>
            <linearGradient id="vera-dash-mark-d" x1="897.32" y1="8092.6" x2="1395.69" y2="7498.67" gradientTransform="matrix(1, 0, 0, -1, 0, 8173.04)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#390c80" />
              <stop offset="0.1" stopColor="#431190" />
              <stop offset="0.28" stopColor="#5019a6" />
              <stop offset="0.47" stopColor="#5a1fb6" />
              <stop offset="0.69" stopColor="#5f22bf" />
              <stop offset="1" stopColor="#6123c2" />
            </linearGradient>
          </defs>
          <path fill="url(#vera-dash-mark-a)" d="M1414.25,636.72,1126,1135.87a275.11,275.11,0,0,1-238.27,137.56h-463A196.55,196.55,0,0,0,595,1175.32s0-.11.1-.17L679,1029.77l163.39-283a220.11,220.11,0,0,1,190.62-110Z" />
          <path fill="url(#vera-dash-mark-b)" d="M679,1029.77l-83.92,145.38c0,.06,0,.12-.1.17a196.57,196.57,0,0,1-340.35-.17L10.44,752.28c-29.66-51.36,7.41-115.56,66.71-115.56h374.9Z" />
          <path fill="url(#vera-dash-mark-c)" d="M1064.76,0A196.55,196.55,0,0,0,894.61,98.11c-.05.06-.05.11-.11.17L810.59,243.66l-163.4,283A220.1,220.1,0,0,1,456.58,636.72H75.32L363.53,137.56A275.12,275.12,0,0,1,601.79,0Z" />
          <path fill="url(#vera-dash-mark-d)" d="M1412.42,636.72h-374.9L810.59,243.66,894.5,98.28c.06-.06.06-.11.11-.17a196.56,196.56,0,0,1,340.34.17l244.18,422.88C1508.79,572.51,1471.72,636.72,1412.42,636.72Z" />
        </svg>
      )}
      {showWordmark && (
        <span
          className={cn(
            "font-display font-medium lowercase tracking-tight text-text-primary",
            textSize[size],
          )}
        >
          vera
        </span>
      )}
    </span>
  );
}
