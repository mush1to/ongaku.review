import { describe, expect, it } from "vitest";
import { legacyUrlTarget } from "./legacy-url";

const protocolRelativeTarget = /^\/[/\\]/;

describe("legacyUrlTarget", () => {
  it.each([
    ["/index.html", "/"],
    ["/about/", "/about"],
    ["/about//", "/about"],
    ["/about.html", "/about"],
    ["/tags/%E3%83%AD%E3%83%83%E3%82%AF.html", "/tags/%E3%83%AD%E3%83%83%E3%82%AF"],
    ["//", ""],
    ["/tags//x/", "/tags//x"],
    ["/tags/a\\b/", "/tags/a\\b"],
  ])("%s を %s へ転送する", (pathname, target) => {
    const actual = legacyUrlTarget(pathname);

    expect(actual).toBe(target);
    expect(actual).not.toMatch(protocolRelativeTarget);
  });

  it.each([
    ["//index.html", "/index"],
    ["//about/", "/about"],
    ["///x.html", "/x"],
    ["//evil.com/", "/evil.com"],
    ["////evil.com/", "/evil.com"],
    ["///.html", "/"],
    ["/\\evil.com/", "/evil.com"],
    ["//\\evil.com.html", "/evil.com"],
    ["/\\/\\evil.com/", "/evil.com"],
  ])(
    "%s の先頭の slash と backslash を 1 つの slash に畳んで %s へ転送する",
    (pathname, target) => {
      const actual = legacyUrlTarget(pathname);

      expect(actual).toBe(target);
      expect(actual).not.toMatch(protocolRelativeTarget);
    },
  );

  it.each(["//about//", "///", "/\\/", "/\\\\.html", "//\\//"])(
    "%s の転送先は / の直後に / も \\ も続けない",
    (pathname) => {
      expect(legacyUrlTarget(pathname)).not.toMatch(protocolRelativeTarget);
    },
  );

  it.each(["/", "/404.html", "/about", "/posts/abbey-road", "/feed.xml"])(
    "%s は転送しない",
    (pathname) => {
      expect(legacyUrlTarget(pathname)).toBeUndefined();
    },
  );
});
