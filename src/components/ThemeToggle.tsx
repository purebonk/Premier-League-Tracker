"use client";

/**
 * Theme override.
 *
 * The themes work without this: prefers-color-scheme drives everything, and the
 * inline script in the layout replays a stored choice before first paint.
 *
 * So this holds no React state. State would have to be read from localStorage
 * after mount, which means either a hydration mismatch or a flash of the wrong
 * label, and it would duplicate a source of truth that already lives on the
 * document. The button reads the current theme off the element it is about to
 * change, and CSS decides which label to show.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.getAttribute("data-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing: the toggle still works for this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch between light and dark theme"
      className="label border border-rule px-2 py-1 hover:border-rule-strong hover:text-ink"
    >
      <span className="theme-when-light">Dark</span>
      <span className="theme-when-dark">Light</span>
    </button>
  );
}
