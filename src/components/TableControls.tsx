import Link from "next/link";
import {
  PRESET_VIEWS,
  SEASONS,
  isPresetActive,
  viewHref,
  type ViewParams,
} from "@/lib/view-params";

/**
 * Every control is a link that changes one query parameter. No client
 * JavaScript, no state, and every view is a shareable URL.
 */

function Option({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`border px-2 py-1 text-[12px] leading-none transition-colors ${
        active
          ? "border-ink bg-ink text-raised"
          : "border-rule bg-raised text-ink-muted hover:border-rule-strong hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="label shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function TableControls({ view }: { view: ViewParams }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {PRESET_VIEWS.map((preset) => (
          <Option
            key={preset.label}
            href={viewHref(view, preset.changes)}
            active={isPresetActive(view, preset.changes)}
          >
            {preset.label}
          </Option>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-rule pt-3">
        <Group label="Season">
          {SEASONS.map((season) => (
            <Option
              key={season}
              href={viewHref(view, { season })}
              active={view.season === season}
            >
              {season}/{String(season + 1).slice(2)}
            </Option>
          ))}
        </Group>

        <Group label="Venue">
          {(["all", "home", "away"] as const).map((venue) => (
            <Option
              key={venue}
              href={viewHref(view, { venue })}
              active={view.venue === venue}
            >
              {venue === "all" ? "All" : venue === "home" ? "Home" : "Away"}
            </Option>
          ))}
        </Group>

        <Group label="Recency">
          {[null, 6, 10].map((lastN) => (
            <Option
              key={String(lastN)}
              href={viewHref(view, { lastN })}
              active={view.lastN === lastN}
            >
              {lastN === null ? "All" : `Last ${lastN}`}
            </Option>
          ))}
        </Group>

        <Group label="Opponents">
          {(["all", "top6", "bottom-half"] as const).map((opponents) => (
            <Option
              key={opponents}
              href={viewHref(view, { opponents })}
              active={view.opponents === opponents}
            >
              {opponents === "all"
                ? "All"
                : opponents === "top6"
                  ? "Top six"
                  : "Bottom half"}
            </Option>
          ))}
        </Group>
      </div>
    </div>
  );
}
