import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { authRouter } from "./routes/auth.routes.js";
import { accountsRouter } from "./routes/accounts.routes.js";
import { banksRouter } from "./routes/banks.routes.js";
import { conciliationRouter } from "./routes/conciliation.routes.js";
import { scriptsRouter } from "./routes/scripts.routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, "../../client/dist")

export function createServer() {
  const app = express();

  app.use(
    cors({
      origin: ["http://localhost:5173", "http://localhost:5174"],
      credentials: true,
    }),
  );

  app.use(express.json());

  // Public
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter);

  // Static files — no auth required
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
  }

  // Protected API
  app.use(authMiddleware);
  app.use("/accounts", accountsRouter);
  app.use("/banks", banksRouter);
  app.use("/conciliation", conciliationRouter);
  app.use("/scripts", scriptsRouter);

  app.use(errorMiddleware);

  // SPA fallback — after API routes, no auth (React handles client-side auth)
  if (existsSync(clientDist)) {
    app.get("/{*splat}", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  return app;
}
