// src/index.ts
import express from "express";
import cors, { CorsOptions } from "cors";
import mongoose from "mongoose";
import { MONGODB_URI, PORT } from "./config";
import licenseRoutes from "./routes/licenseRoutes";
import adminRoutes from "./routes/adminRoutes";
import userRoutes from "./routes/userRoutes";
import paddlePaymentHandler from "./routes/paddlePaymentRoute";
import { initializeTelegramBot } from "./utils/telegramBot";



async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB connected");

  const app = express();

  const corsOptions: CorsOptions = {
    // Allow any origin (including browser extensions and file://) during development.
    // If you need to restrict this in production, replace the callback with
    // a whitelist check instead of the permissive "true" below.

    origin: ["*", "http://localhost:5173", "https://www.etsy.com", "https://etsy.com", "https://dailysale.app", "https://h5173.kitpes.com"],
    credentials: true,
    methods: ["GET","POST","PUT","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization", "x-user-email"],
  };
  app.use(cors(corsOptions));
  //app.options("*", cors(corsOptions));
  //app.options("*", cors());
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({ status: "ok", service: "Etsy Sale Manager License API" });
  });

  app.post("/paddlepayment", paddlePaymentHandler);
  app.post("/api/v1/payments/webhook", paddlePaymentHandler);

  app.use("/api/license", licenseRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api", userRoutes);

  initializeTelegramBot();

  app.listen(PORT, () => {
    console.log(`License server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
