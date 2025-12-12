import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { rateLimit } from "./middleware/rate-limit.js";
import { getAllowedOrigins } from "../lib/cors-config.js";
import dropRouter from "./routes/drop.js";
import dropsRouter from "./routes/drops.js";
import powRouter from "./routes/pow.js";
import queueRouter from "./routes/queue.js";

const app = new Hono();

// CORS middleware - allow configured origins or defaults for local dev
const allowedOrigins = getAllowedOrigins();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
    exposeHeaders: ["Content-Type"],
    credentials: true,
  })
);

// API Routes
app.route("/api/drop", dropRouter);
app.route("/api/drops", dropsRouter);
app.route("/api/pow", powRouter);
app.route("/api/queue", queueRouter);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// 404 for all other routes (Next.js frontend handles static assets)
app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
