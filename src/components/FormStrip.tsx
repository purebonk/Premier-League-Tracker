/**
 * Last-five results.
 *
 * Deliberately not club-coloured: a strip tinted by club cannot distinguish a
 * win from a loss, which is the only thing it is there to show. Ink at three
 * weights instead — filled, outlined, hollow — which also avoids a green/red
 * traffic light that colour-blind readers cannot separate.
 */
const STYLES: Record<string, string> = {
  W: "bg-ink text-raised border-ink",
  D: "bg-transparent text-ink border-ink",
  L: "bg-transparent text-ink-muted border-rule-strong",
};

const LABELS: Record<string, string> = { W: "Won", D: "Drew", L: "Lost" };

export function FormStrip({ form }: { form: string }) {
  const results = form.split(" ").filter(Boolean);
  if (results.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }

  return (
    <span
      className="inline-flex gap-[3px]"
      aria-label={`Recent form, most recent first: ${results
        .map((r) => LABELS[r] ?? r)
        .join(", ")}`}
    >
      {results.map((result, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`inline-flex size-[15px] items-center justify-center border text-[9px] font-semibold leading-none ${
            STYLES[result] ?? STYLES.L
          }`}
        >
          {result}
        </span>
      ))}
    </span>
  );
}
