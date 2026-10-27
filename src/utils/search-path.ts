// Search URLs use the same slashless paths as the published pages.
export const normalizeSearchPath = (url: string) => {
  const path = url
    .replace(/\/+$/, "")
    .replace(/(^|\/)index$/, "$1")
    .replace(/\/+$/, "");
  return path || "/";
};

/** Tags match by NFKC form so the build and the search page agree on equality. */
export const normalizeTag = (tag: string) => tag.normalize("NFKC").trim();

export function tagRoutePath(tag: string): string {
  const normalized = normalizeTag(tag);
  const segments = normalized.split("/");
  const hasUnsafeCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      character === "\\" || (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f))
    );
  });
  if (
    !normalized ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    hasUnsafeCharacter
  )
    throw new Error("タグ名を安全なURLに変換できません");
  return "/tags/" + segments.map(encodeURIComponent).join("/");
}
