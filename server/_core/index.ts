import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ensureSeed } from "../seed";
import { runReminders } from "../services/reminders";
import { sdk } from "./sdk";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });

  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res, next) => {
      const { handleStripeWebhookRequest } = await import("../stripe/webhook");
      return handleStripeWebhookRequest(req, res, next);
    }
  );

  app.post("/api/scheduled/metro-reminders", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        res.status(403).json({ ok: false, error: "cron identity required" });
        return;
      }
      const result = await runReminders();
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[reminders]", error);
      res.status(401).json({ ok: false });
    }
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  try {
    await ensureSeed();
  } catch (error) {
    console.warn("[Seed] skipped:", error);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
