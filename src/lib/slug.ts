/**
 * Club URL slugs are derived from the club name rather than stored, so a club
 * cannot end up with a slug that disagrees with its name after a rename.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    // Split accented characters into base + combining mark, then drop the marks.
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
