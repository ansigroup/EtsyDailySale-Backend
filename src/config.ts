// src/config.ts
import dotenv from "dotenv";
dotenv.config();

export const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/esm-licenses";
export const PORT = Number(process.env.PORT || 4000);

// simple admin secret for creating licenses
export const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

// used for generating referral links in API responses
export const APP_BASE_URL = process.env.APP_BASE_URL || "";

// email/magic link delivery
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@dailysale.app";

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
export const TELEGRAM_VISITOR_NOTIFICATIONS =
  process.env.TELEGRAM_VISITOR_NOTIFICATIONS !== "false";

export type PaddleEnvironment = "sandbox" | "production";

// Paddle Billing configuration (Paddle.js)
export const PADDLE_CLIENT_SIDE_TOKEN = process.env.PADDLE_CLIENT_SIDE_TOKEN || "";
export const PADDLE_SANDBOX_CLIENT_SIDE_TOKEN =
  process.env.PADDLE_SANDBOX_CLIENT_SIDE_TOKEN || PADDLE_CLIENT_SIDE_TOKEN;
export const PADDLE_PRICE_ID = process.env.PADDLE_PRICE_ID || "";
export const PADDLE_SANDBOX_PRICE_ID = process.env.PADDLE_SANDBOX_PRICE_ID || PADDLE_PRICE_ID;
export const PADDLE_PRICE2_ID = process.env.PADDLE_PRICE2_ID || "";
export const PADDLE_SANDBOX_PRICE2_ID = process.env.PADDLE_SANDBOX_PRICE2_ID || PADDLE_PRICE2_ID;
export const PADDLE_ENVIRONMENT: PaddleEnvironment =
  process.env.PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
export const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || "";

export const CREDITS_PER_RUN = Number(process.env.CREDITS_PER_RUN || 1);
export const CREDITS_PACK_SMALL = Number(process.env.CREDITS_PACK_SMALL || 30);
export const CREDITS_PACK_LARGE = Number(process.env.CREDITS_PACK_LARGE || 200);
export const FREE_RUNS_ON_SIGNUP = Number(process.env.FREE_RUNS_ON_SIGNUP || 0);
export const REFERRAL_SIGNUP_CREDITS = Number(process.env.REFERRAL_SIGNUP_CREDITS || 2);
export const REFERRAL_PURCHASE_BONUS_RATE = Number(
  process.env.REFERRAL_PURCHASE_BONUS_RATE || 0.1
);

/*
curl -X POST http://localhost:4000/api/admin/license \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: change-me-test-pass123" \
  -d '{
    "plan": "trial",
    "maxRunsPerMonth": 3
  }'


curl -X POST http://localhost:4000/api/admin/license \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: change-me-test-pass123" \
  -d '{
    "key": "ESM-TRIAL-1234-5678",
    "plan": "trial",
    "maxRunsPerMonth": 3
  }'


  */
