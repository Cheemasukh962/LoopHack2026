import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleMe } from "./routes/me";
import { handleFeed } from "./routes/feed";
import { handleIssue } from "./routes/issues";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Frontend-wiring endpoints (see shared/api.ts for the response shapes).
  app.get("/api/me", handleMe);
  app.get("/api/feed", handleFeed);
  app.get("/api/issues/:id", handleIssue);

  return app;
}
