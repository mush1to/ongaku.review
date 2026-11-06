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
    ["/tags//x/", "/tags//x"],
  ])("%s を %s へ転送する", (pathname, target) => {
    expect(legacyUrlTarget(pathname)).toBe(target);
  });

  it.each([
    ["//index.html", "/index"],
    ["//about/", "/about"],
    ["///x.html", "/x"],
    ["//evil.com/", "/evil.com"],
    ["///.html", "/"],
  ])("%s の先頭の slash を 1 つに畳んで %s へ転送する", (pathname, target) => {
    expect(legacyUrlTarget(pathname)).toBe(target);
  });

  it.each(["//index.html", "//about/", "///x.html", "//evil.com/", "///.html", "//about//", "///"])(
    "%s の転送先は // で始まらない",
    (pathname) => {
      expect(legacyUrlTarget(pathname)).not.toMatch(/^\/\//);
    },
  );

  it.each(["/", "/404.html", "/about", "/posts/abbey-road", "/feed.xml"])(
    "%s は転送しない",
    (pathname) => {
      expect(legacyUrlTarget(pathname)).toBeUndefined();
    },
  );
});
