import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes.js";
import { accountsRouter } from "./routes/accounts.routes.js";
import { banksRouter } from "./routes/banks.routes.js";
import { conciliationRouter } from "./routes/conciliation.routes.js";
import { scriptsRouter } from "./routes/scripts.routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";

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

  // Protected
  app.use(authMiddleware);
  app.use("/accounts", accountsRouter);
  app.use("/banks", banksRouter);
  app.use("/conciliation", conciliationRouter);
  app.use("/scripts", scriptsRouter);

  app.use(errorMiddleware);
  return app;
}
