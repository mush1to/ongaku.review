import type { IncomingMessage, ServerResponse } from "node:http";

export function legacyUrlTarget(pathname: string) {
  if (pathname === "/" || pathname === "/404.html") return undefined;
  if (pathname === "/index.html") return "/";
  const target = pathname.endsWith("/")
    ? pathname.replace(/\/+$/, "")
    : pathname.endsWith(".html")
      ? pathname.slice(0, -".html".length)
      : undefined;
  return target?.replace(/^[/\\]+/, "/");
}

export function createLegacyUrlRedirect(targetExists: (target: string) => Promise<boolean>) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const target = legacyUrlTarget(url.pathname);
      if (target === undefined || !(await targetExists(target))) return next();
      response.statusCode = 301;
      response.setHeader("Location", target + url.search);
      response.end();
    } catch (error) {
      next(error);
    }
  };
}
