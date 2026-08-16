import { clubTintStyle } from "@/lib/colors";

/**
 * A club's colour bar. No crests or badges anywhere on this site — they are
 * trademarked. Colour and name only, resolved centrally and per theme, so a
 * club looks the same here as on the chart in either ground.
 */
export function ClubMark({
  primaryColor,
  secondaryColor,
  className = "h-[15px] w-[3px]",
}: {
  primaryColor: string | null;
  secondaryColor: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`club-tint inline-block shrink-0 rounded-[1px] ${className}`}
      style={{ ...clubTintStyle(primaryColor, secondaryColor), background: "var(--club)" }}
    />
  );
}
