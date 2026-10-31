import { describe, expect, it } from "vitest";
import { resolveBuildOutDir } from "./output-dir";

describe("resolveBuildOutDir", () => {
  it("未設定ならdistを使う", () => {
    expect(resolveBuildOutDir(undefined)).toBe("dist");
  });

  it("dist-e2eへ切り替える", () => {
    expect(resolveBuildOutDir("dist-e2e")).toBe("dist-e2e");
  });

  it("許可していない出力先を拒否する", () => {
    for (const value of ["", "../out", "/tmp/out", "dist-e2e/nested"])
      expect(() => resolveBuildOutDir(value), value).toThrow(
        "BUILD_OUT_DIR: dist か dist-e2e を指定してください",
      );
  });
});
