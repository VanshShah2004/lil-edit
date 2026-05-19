import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import productsRouter from "./routes/products.js";
import skuRouter from "./routes/sku.js";
import { warmupRedis } from "./lib/redis.js";

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

app.use(
  cors({
    origin,
    credentials: true,
  })
);

// Large limit: Curation Studio sends base64 image data URLs in the payload.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "50mb" }));

app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/sku", skuRouter);

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "new-ecomm backend" });
});


app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  void warmupRedis();
});
