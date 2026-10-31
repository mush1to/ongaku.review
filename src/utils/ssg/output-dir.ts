export function resolveBuildOutDir(value: string | undefined) {
  const outDir = value ?? "dist";
  if (outDir !== "dist" && outDir !== "dist-e2e")
    throw new Error("BUILD_OUT_DIR: dist か dist-e2e を指定してください");
  return outDir;
}
