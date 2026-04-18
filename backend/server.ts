import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(express.json());

const origin =
  process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean) ?? [
    "http://localhost:5173",
    "http://localhost:5174",
  ];

const PORT = Number(process.env.PORT) || 5000;

app.use(
  cors({
    origin,
    credentials: true,
  })
);

app.use("/api/auth", authRouter);

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "new-ecomm backend" });
});


app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
