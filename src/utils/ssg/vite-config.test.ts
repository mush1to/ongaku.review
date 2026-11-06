import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { describe, expect, it } from "vitest";
import siteConfig from "../../../vite.config";

type Command = "build" | "serve";
type AnyHook = (this: unknown, ...args: unknown[]) => unknown;
type Middleware = (
  request: unknown,
  response: unknown,
  next: (...args: unknown[]) => void,
) => unknown;

const safeLocation = /^\/(?![/\\])/;

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

async function devMiddlewares() {
  const plugin = findPlugin(await getPlugins("serve", "development"), "site-public-search");
  const middlewares: Middleware[] = [];
  await hookHandler(plugin.configureServer)?.call(plugin, {
    watcher: { on() {} },
    middlewares: { use: (middleware: Middleware) => middlewares.push(middleware) },
  });
  return middlewares;
}

async function requestThroughDevServer(url: string) {
  const middlewares = await devMiddlewares();
  const headers = new Map<string, string>();
  const response = {
    statusCode: 200,
    ended: false,
    setHeader: (name: string, value: string) => headers.set(name, value),
    end() {
      response.ended = true;
    },
  };
  const errors: unknown[] = [];
  let passedThrough = false;
  async function runFrom(index: number): Promise<void> {
    const middleware = middlewares[index];
    if (!middleware) {
      passedThrough = true;
      return;
    }
    let following: Promise<void> | undefined;
    await middleware({ url }, response, (...args) => {
      if (args.length) errors.push(args[0]);
      else following = runFrom(index + 1);
    });
    await following;
  }
  await runFrom(0);
  return {
    statusCode: response.statusCode,
    ended: response.ended,
    headers,
    errors,
    passedThrough,
  };
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
        for (const file of ["search-index.json", "search-pages.json"])
          await expect(readFile(path.join(absentOutput, file), "utf8")).rejects.toMatchObject({
            code: "ENOENT",
          });
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
      await expect(
        readFile(path.join(outputRoot, "search-index.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      const searchPages = await readFile(path.join(outputRoot, "search-pages.json"), "utf8");
      expect(JSON.parse(searchPages)["/abbey-road"]).toMatchObject({
        path: "/posts/abbey-road",
        icon: "cd",
      });
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});

describe("Dev server legacy URL redirect", () => {
  it.each([
    ["/index.html", "/"],
    ["/index.html?q=1", "/?q=1"],
    ["/about/?q=1", "/about?q=1"],
    ["/about//", "/about"],
    ["/about.html?q=1", "/about?q=1"],
    ["/posts/abbey-road/", "/posts/abbey-road"],
    ["/tags/%E3%83%AD%E3%83%83%E3%82%AF.html?q=1", "/tags/%E3%83%AD%E3%83%83%E3%82%AF?q=1"],
    ["/.//about/?q=1", "/about?q=1"],
    ["/.//about.html", "/about"],
  ])("redirects %s to %s", async (source, target) => {
    const result = await requestThroughDevServer(source);

    expect(result.statusCode).toBe(301);
    expect(result.headers.get("Location")).toBe(target);
    expect(result.headers.get("Location")).toMatch(safeLocation);
    expect(result.ended).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.passedThrough).toBe(false);
  });

  it.each(["/", "/about", "/404.html", "/missing/", "/missing.html?q=1"])(
    "passes %s through every middleware",
    async (source) => {
      const result = await requestThroughDevServer(source);

      expect(result.statusCode).toBe(200);
      expect(result.headers.size).toBe(0);
      expect(result.ended).toBe(false);
      expect(result.errors).toEqual([]);
      expect(result.passedThrough).toBe(true);
    },
  );

  it.each([
    "//index.html",
    "//about/",
    "//about/?q=1",
    "///x.html",
    "/.//index.html",
    "/.//about/?q=1",
    "/\\evil.com/",
    "/./\\evil.com/",
    "/.//evil.com/",
    "/.///\\evil.com/",
    "/.//\\evil.com.html",
    "/./\\/evil.com/",
  ])("does not send a protocol-relative Location for %s", async (source) => {
    const result = await requestThroughDevServer(source);

    if (result.statusCode === 301) expect(result.headers.get("Location")).toMatch(safeLocation);
    else expect(result.headers.has("Location")).toBe(false);
  });

  it("passes an unparsable URL to the next middleware as an error", async () => {
    const result = await requestThroughDevServer("//");

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBeInstanceOf(TypeError);
    expect(result.passedThrough).toBe(false);
  });
});
