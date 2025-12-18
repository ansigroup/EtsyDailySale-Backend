// src/config.ts
import dotenv from "dotenv";
dotenv.config();

export const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/esm-licenses";
export const PORT = Number(process.env.PORT || 4000);

// simple admin secret for creating licenses
export const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-test-pass123";

// used for generating referral links in API responses
export const APP_BASE_URL = process.env.APP_BASE_URL || "https://dailysale.app";

// email/magic link delivery
export const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_eTRdjJEc_3QYX7NQR4vDFYnBQYNefeApi";
export const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@dailysale.app";

export type PaddleEnvironment = "sandbox" | "production";

// Paddle Billing configuration (Paddle.js)
export const PADDLE_CLIENT_SIDE_TOKEN = process.env.PADDLE_CLIENT_SIDE_TOKEN || "test_a82576b85009718f182b48e42d7";
export const PADDLE_SANDBOX_CLIENT_SIDE_TOKEN =
  process.env.PADDLE_SANDBOX_CLIENT_SIDE_TOKEN || PADDLE_CLIENT_SIDE_TOKEN;
export const PADDLE_PRICE_ID = process.env.PADDLE_PRICE_ID || "pri_01kb5pzzvtf11j701maz7cq2tz";
export const PADDLE_SANDBOX_PRICE_ID = process.env.PADDLE_SANDBOX_PRICE_ID || PADDLE_PRICE_ID;
export const PADDLE_PRICE2_ID = process.env.PADDLE_PRICE2_ID || "pri_01kb5q435mh3aeabrxzew6axyy";
export const PADDLE_SANDBOX_PRICE2_ID = process.env.PADDLE_SANDBOX_PRICE2_ID || PADDLE_PRICE2_ID;
export const PADDLE_ENVIRONMENT: PaddleEnvironment =
  process.env.PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";

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
