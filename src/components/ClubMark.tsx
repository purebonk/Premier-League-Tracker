import { clubColor } from "@/lib/colors";

/**
 * A club's colour bar. No crests or badges anywhere on this site — they are
 * trademarked. Colour and name only, and the colour is resolved centrally so
 * a club looks the same here as it does on the chart.
 */
export function ClubMark({
  primaryColor,
  secondaryColor,
}: {
  primaryColor: string | null;
  secondaryColor: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[14px] w-[3px] shrink-0 rounded-[1px]"
      style={{ backgroundColor: clubColor(primaryColor, secondaryColor) }}
    />
  );
}
