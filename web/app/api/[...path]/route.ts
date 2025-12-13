export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

function getApiBaseUrl(): string {
  const explicit = process.env.INTERNAL_API_URL;
  if (explicit) return explicit;

  // Fly sets FLY_APP_NAME at runtime (e.g. "fdrop-web")
  const flyName = process.env.FLY_APP_NAME;
  if (flyName?.endsWith("-web")) {
    const prefix = flyName.slice(0, -"-web".length);
    return `http://${prefix}-api.internal:8080`;
  }

  // Local dev fallback (Next dev uses rewrites in web/next.config.ts)
  return "http://localhost:3003";
}

async function proxy(req: Request, path: string[]): Promise<Response> {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const url = new URL(`${base}/api/${path.join("/")}`);
  url.search = new URL(req.url).search;

  // Forward request with original method/body; strip hop-by-hop headers.
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: req.body,
    // @ts-expect-error duplex is needed for streaming request bodies in Node.
    duplex: "half",
    redirect: "manual",
  });

  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("transfer-encoding");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export async function GET(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function OPTIONS(req: Request, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
