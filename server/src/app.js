import fs from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./env.js";
import { HttpError, errorHandler } from "./lib/errors.js";
import { originGuard, requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import contractRoutes from "./routes/contracts.js";
import otpRoutes from "./routes/otp.js";
import excelRoutes from "./routes/excel.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  app.use(originGuard);
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { message: "Too many requests. Slow down." } }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);

  // everything below needs a signed-in user
  app.use("/api/users", requireAuth, userRoutes);
  app.use("/api/contracts", requireAuth, contractRoutes);
  app.use("/api/otp", requireAuth, otpRoutes);
  app.use("/api/excel", requireAuth, excelRoutes);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found.")));

  // Optional: serve the built client from the same server (one origin, no CORS)
  if (config.staticDir && fs.existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.staticDir, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
