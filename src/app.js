import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { fleetRouter } from "./routes/fleet.js";
import { processesRouter } from "./routes/processes.js";
import { projectsRouter } from "./routes/projects.js";

export const createApp = () => {
  const app = express();

  // The refresh token travels as an httpOnly cookie, so the browser needs an
  // explicit origin plus credentials — a wildcard would be rejected.
  app.use(
    cors({
      origin: config.clientOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use(authRouter);

  // Everything under /api needs a valid access token. Unlike the backend this
  // replaces, no domain data is readable without one.
  app.use("/api", (req, res, next) => requireAuth(req, res, next));

  app.use(catalogRouter);
  app.use(fleetRouter);
  app.use(projectsRouter);
  app.use(processesRouter);

  app.use((_req, res) => {
    res.status(404).json({ status: "error", error: "Route Not Found" });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error("[api]", err);
    res.status(status).json({
      success: false,
      message: err.message ?? "Server error",
      error: err.message ?? "Server error",
    });
  });

  return app;
};
