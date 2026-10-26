import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { describe, expect, it } from "vitest";
import siteConfig from "../../../vite.config";

type Command = "build" | "serve";
type AnyHook = (this: unknown, ...args: unknown[]) => unknown;

function flattenPlugins(options: unknown): Plugin[] {
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => {
    if (Array.isArray(option)) return flattenPlugins(option);
    if (option && typeof option === "object" && "name" in option) return [option as Plugin];
    return [];
  });
}

async function getPlugins(command: Command, mode: string) {
  const config = await siteConfig({
    command,
    mode,
    isSsrBuild: false,
    isPreview: false,
  });
  return flattenPlugins(config.plugins);
}

function findPlugin(plugins: Plugin[], name: string) {
  const plugin = plugins.find((item) => item.name === name);
  if (!plugin) throw new Error(`Missing plugin: ${name}`);
  return plugin;
}

function hookHandler(hook: unknown): AnyHook | undefined {
  if (typeof hook === "function") return hook as AnyHook;
  if (hook && typeof hook === "object" && "handler" in hook && typeof hook.handler === "function")
    return hook.handler as AnyHook;
  return undefined;
}

async function invokeConfigResolved(plugin: Plugin, command: Command, outDir: string) {
  await hookHandler(plugin.configResolved)?.call(plugin, {
    command,
    build: { outDir },
  } as ResolvedConfig);
}

async function invokeCloseBundle(plugin: Plugin) {
  await hookHandler(plugin.closeBundle)?.call(plugin);
}

async function invokeLoad(plugin: Plugin, id: string) {
  return hookHandler(plugin.load)?.call(plugin, id);
}

async function invokeResolveId(plugin: Plugin, id: string) {
  return hookHandler(plugin.resolveId)?.call(plugin, id, undefined, undefined);
}

describe("Vite search writer lifecycle", () => {
  it.each(["development", "production"])(
    "does not write search output while serving in %s mode",
    async (mode) => {
      const plugins = await getPlugins("serve", mode);
      const nativeSearch = findPlugin(plugins, "ox-content:search");
      const customSearch = findPlugin(plugins, "site-public-search");

      expect(nativeSearch.closeBundle).toBeUndefined();
      expect(await invokeResolveId(nativeSearch, "virtual:ox-content/search")).toBe(
        "\0virtual:ox-content/search",
      );
      expect(await invokeLoad(nativeSearch, "\0virtual:ox-content/search")).toContain(
        "search-index.json",
      );

      const outputRoot = await mkdtemp(path.join(os.tmpdir(), "ongaku-vite-config-"));
      try {
        const existingOutput = path.join(outputRoot, "existing");
        const existingIndex = path.join(existingOutput, "search-index.json");
        await mkdir(existingOutput, { recursive: true });
        await writeFile(existingIndex, '{"sentinel":true}\n');
        await invokeConfigResolved(customSearch, "serve", existingOutput);
        await invokeCloseBundle(customSearch);
        expect(await readFile(existingIndex, "utf8")).toBe('{"sentinel":true}\n');

        const absentOutput = path.join(outputRoot, "absent");
        await invokeConfigResolved(customSearch, "serve", absentOutput);
        await invokeCloseBundle(customSearch);
        await expect(
          readFile(path.join(absentOutput, "search-index.json"), "utf8"),
        ).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await rm(outputRoot, { recursive: true, force: true });
      }
    },
  );

  it("retains both search writers for a nonstandard build mode", async () => {
    const plugins = await getPlugins("build", "staging");
    const nativeSearch = findPlugin(plugins, "ox-content:search");
    const customSearch = findPlugin(plugins, "site-public-search");

    expect(typeof nativeSearch.closeBundle).toBe("function");
    expect(customSearch.closeBundle).toMatchObject({ order: "post", sequential: true });

    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "ongaku-vite-config-"));
    try {
      await invokeConfigResolved(customSearch, "build", outputRoot);
      await invokeCloseBundle(customSearch);
      const searchIndex = await readFile(path.join(outputRoot, "search-index.json"), "utf8");
      expect(searchIndex).toContain("abbey-road");
      expect(searchIndex.toLowerCase()).not.toContain("unpublished-test");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
