export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

function getSseBaseUrl(): string {
  const explicit = process.env.INTERNAL_SSE_URL;
  if (explicit) return explicit;

  const flyName = process.env.FLY_APP_NAME;
  if (flyName?.endsWith("-web")) {
    const prefix = flyName.slice(0, -"-web".length);
    return `http://${prefix}-sse.internal:8080`;
  }

  // Local dev fallback (Next dev uses rewrites in web/next.config.ts)
  return "http://localhost:3004";
}

async function proxySse(req: Request, path: string[]): Promise<Response> {
  const base = getSseBaseUrl().replace(/\/$/, "");
  const url = new URL(`${base}/events/${path.join("/")}`);
  url.search = new URL(req.url).search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");

  const upstream = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
  });

  const resHeaders = new Headers(upstream.headers);
  // Ensure SSE stays unbuffered/cached properly
  resHeaders.set("cache-control", "no-cache, no-transform");
  resHeaders.set("connection", "keep-alive");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export async function GET(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxySse(req, path);
}
