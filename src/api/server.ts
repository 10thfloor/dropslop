import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rateLimit } from "./middleware/rate-limit.js";
import dropRouter from "./routes/drop.js";
import powRouter from "./routes/pow.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3005",
      "http://localhost:3003",
      "http://127.0.0.1:3005",
      "http://127.0.0.1:3003",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
    exposeHeaders: ["Content-Type"],
    credentials: true,
  })
);

// Routes (must come before static files)
app.route("/api/drop", dropRouter);
app.route("/api/pow", powRouter);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Static files (fallback for non-API routes)
app.get("/*", async (c) => {
  try {
    const path = c.req.path === "/" ? "/index.html" : c.req.path;
    const filePath = join(__dirname, "../../public", path);
    const content = readFileSync(filePath);

    // Determine content type
    const ext = path.split(".").pop();
    const contentType =
      {
        html: "text/html; charset=utf-8",
        js: "application/javascript; charset=utf-8",
        css: "text/css; charset=utf-8",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        svg: "image/svg+xml",
        ico: "image/x-icon",
      }[ext || ""] || "text/plain";

    return c.body(content, 200, { "Content-Type": contentType });
  } catch (error) {
    return c.notFound();
  }
});

export default app;
