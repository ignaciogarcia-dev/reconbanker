import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { bindRoutes } from "../composition/bindRoutes.js";
import { buildContainer, type Container } from "../composition/container.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, "../../client/dist")

export function createServer(container: Container = buildContainer()) {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:5173", "http://localhost:5174"],
      credentials: true,
    }),
  );

  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
  }

  bindRoutes(app, container);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  app.use(errorMiddleware);

  if (existsSync(clientDist)) {
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  return app;
}
