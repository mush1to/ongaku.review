import { describe, expect, it } from "vitest";
import { normalizeSearchPath, normalizeTag, tagRoutePath } from "./search-path";

describe("normalizeSearchPath", () => {
  it.each([
    ["/", "/"],
    ["/about/", "/about"],
    ["/posts/example/index/", "/posts/example"],
    ["/index", "/"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeSearchPath(input)).toBe(expected);
  });
});

describe("tagRoutePath", () => {
  it("uses the normalized tag and encodes each path segment", () => {
    expect(tagRoutePath(" ＡＣ/DC ")).toBe("/tags/AC/DC");
    expect(tagRoutePath("main")).toBe("/tags/main");
    expect(tagRoutePath(" ％ #日本語 space ")).toBe(
      "/tags/%25%20%23%E6%97%A5%E6%9C%AC%E8%AA%9E%20space",
    );
    expect(normalizeTag("＃ｼﾞｬｽﾞ")).toBe("#ジャズ");
  });

  it.each(["", ".", "..", "a/../b", "a//b", "a\\b", "a\u0000b"])("rejects unsafe tag %s", (tag) => {
    expect(() => tagRoutePath(tag)).toThrow("タグ名を安全なURLに変換できません");
  });
});
