// The search index stores page URLs without the trailing slash and keeps "index" segments.
export const normalizeSearchPath = (url: string) => {
  const path = url.replace(/(^|\/)index$/, "$1");
  return path.endsWith("/") ? path : path + "/";
};

/** Tags match by NFKC form so the build and the search page agree on equality. */
export const normalizeTag = (tag: string) => tag.normalize("NFKC").trim();
