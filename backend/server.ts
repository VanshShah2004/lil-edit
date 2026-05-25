import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import productsRouter from "./routes/products.js";
import skuRouter from "./routes/sku.js";
import cartRouter from "./routes/cart.js";
import { warmupRedis, startRedisKeepalive } from "./lib/redis.js";
import { supabaseAdmin, supabaseAnon } from "./lib/supabase.js";
import { createLog } from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();

const origin =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
  ];

const PORT = Number(process.env.PORT) || 5000;

app.use(compression());
app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "50mb" }));

app.use("/api/auth",     authRouter);
app.use("/api/products", productsRouter);
app.use("/api/sku",      skuRouter);
app.use("/api/cart",     cartRouter);

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "new-ecomm backend" });
});

const DB_KEEPALIVE_MS = 4 * 60 * 1000; // 4 min — Supabase idles after ~5 min

function startDbKeepAlive(): void {
  const client = supabaseAdmin ?? supabaseAnon;
  setInterval(async () => {
    const log = createLog().start("DB KEEPALIVE");
    try {
      await client.from("products").select("id").limit(1);
      log.success("ping OK").end("DB KEEPALIVE");
    } catch (err) {
      log.error("ping failed", err).end("DB KEEPALIVE");
    }
  }, DB_KEEPALIVE_MS);
}

async function warmupStorage(): Promise<void> {
  if (!supabaseAdmin) return;
  const log = createLog().start("STORAGE WARMUP");
  const { error } = await supabaseAdmin.storage.createBucket("product-images", { public: true });
  if (error && !error.message.toLowerCase().includes("already exists")) {
    log.error(`bucket creation failed: ${error.message}`, error).end("STORAGE WARMUP");
  } else {
    log.success('bucket "product-images" ready').end("STORAGE WARMUP");
  }
}

app.listen(PORT, () => {
  console.log(`\nAPI listening on http://localhost:${PORT}`);

  const log = createLog().start("REDIS WARMUP");
  void warmupRedis(log).then(() => {
    log.end("REDIS WARMUP");
    startRedisKeepalive();
  });

  void warmupStorage();

  startDbKeepAlive();
});
