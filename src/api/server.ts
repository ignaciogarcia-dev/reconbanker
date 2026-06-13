import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { apiRateLimiter } from "./middlewares/rateLimit.middleware.js";
import { bindRoutes } from "../composition/bindRoutes.js";
import { buildContainer, type Container } from "../composition/container.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, "../../client/dist")

const DEV_CORS_ORIGINS = ["http://localhost:5173", "http://localhost:5174"]

export function resolveCorsOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean)
  if (fromEnv && fromEnv.length > 0) return fromEnv
  // No origins configured: only fall back to localhost outside production.
  return process.env.NODE_ENV === "production" ? [] : DEV_CORS_ORIGINS
}

export function createServer(container: Container = buildContainer()) {
  const app = express();

  // Behind Nginx/reverse proxy: trust the first hop so req.ip and rate limiting
  // use the real client IP from X-Forwarded-For.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // The SPA and API are served same-origin; allow inline styles for Tailwind.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // HSTS is emitted by the app; TLS itself is terminated at Nginx.
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  app.use(
    cors({
      origin: resolveCorsOrigins(),
      credentials: true,
    }),
  );

  // Cap request bodies to bound memory use from oversized/malicious payloads.
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", apiRateLimiter);

  // Liveness: the process is up and serving. Must not depend on external services.
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Readiness: verifies the critical dependencies are reachable. Use this for
  // monitoring/uptime checks; returns 503 if PostgreSQL or Redis is down.
  app.get("/api/health", async (_req, res) => {
    try {
      if (container.pool) await container.pool.query("SELECT 1");
      if (container.redis) await container.redis.ping();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
  }

  bindRoutes(app, container);

  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));

  app.use(errorMiddleware);

  if (existsSync(clientDist)) {
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  return app;
}
