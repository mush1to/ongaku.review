import { describe, expect, it } from "vitest";
import { legacyUrlTarget } from "./legacy-url";

describe("legacyUrlTarget", () => {
  it.each([
    ["/index.html", "/"],
    ["/about/", "/about"],
    ["/about//", "/about"],
    ["/about.html", "/about"],
    ["/tags/%E3%83%AD%E3%83%83%E3%82%AF.html", "/tags/%E3%83%AD%E3%83%83%E3%82%AF"],
    ["//", ""],
  ])("%s を %s へ転送する", (pathname, target) => {
    expect(legacyUrlTarget(pathname)).toBe(target);
  });

  it.each(["/", "/404.html", "/about", "/posts/abbey-road", "/feed.xml"])(
    "%s は転送しない",
    (pathname) => {
      expect(legacyUrlTarget(pathname)).toBeUndefined();
    },
  );
});
