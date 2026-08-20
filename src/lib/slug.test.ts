import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates club names", () => {
    expect(slugify("Manchester United")).toBe("manchester-united");
    expect(slugify("Tottenham Hotspur")).toBe("tottenham-hotspur");
  });

  it("spells out ampersands rather than dropping them", () => {
    // "Brighton & Hove Albion" must not collapse to "brighton-hove-albion"
    // silently losing the word; the round trip has to stay readable.
    expect(slugify("Brighton & Hove Albion")).toBe("brighton-and-hove-albion");
  });

  it("strips accents to their base letters", () => {
    expect(slugify("Atlético Madrid")).toBe("atletico-madrid");
    expect(slugify("Beşiktaş")).toBe("besiktas");
  });

  it("removes punctuation without leaving stray separators", () => {
    expect(slugify("Nott'm Forest")).toBe("nott-m-forest");
    expect(slugify("  A.F.C. Bournemouth  ")).toBe("a-f-c-bournemouth");
  });

  it("never returns leading or trailing hyphens", () => {
    for (const name of ["!!Arsenal!!", "  Chelsea  ", "---Leeds---"]) {
      const slug = slugify(name);
      expect(slug.startsWith("-")).toBe(false);
      expect(slug.endsWith("-")).toBe(false);
    }
  });

  it("is stable, so a slug in a URL keeps resolving", () => {
    expect(slugify("Wolverhampton Wanderers")).toBe(slugify("Wolverhampton Wanderers"));
  });
});
