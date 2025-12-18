import { initializePaddle, Paddle as PaddleJs } from "@paddle/paddle-js";
import {
  PADDLE_CLIENT_SIDE_TOKEN,
  PADDLE_ENVIRONMENT, PADDLE_PRICE2_ID,
  PADDLE_PRICE_ID,
  PADDLE_SANDBOX_CLIENT_SIDE_TOKEN, PADDLE_SANDBOX_PRICE2_ID,
  PADDLE_SANDBOX_PRICE_ID,
  PaddleEnvironment,
} from "../config";

const clients: Partial<Record<PaddleEnvironment, Promise<PaddleJs | undefined>>> = {};

function resolveEnvironment(requested?: PaddleEnvironment): PaddleEnvironment {
  if (requested) return requested;
  return PADDLE_ENVIRONMENT;
}

function tokenForEnvironment(env: PaddleEnvironment) {
  return env === "sandbox" ? PADDLE_SANDBOX_CLIENT_SIDE_TOKEN : PADDLE_CLIENT_SIDE_TOKEN;
}

export function paddleInitializationConfig(environment?: PaddleEnvironment, pwCustomerId?: string) {
  const env = resolveEnvironment(environment);
  const token = tokenForEnvironment(env);
  const pwCustomer = pwCustomerId ? { id: pwCustomerId } : {};
  return { env, token, pwCustomer };
}

export async function getPaddleClient(environment?: PaddleEnvironment, pwCustomerId?: string) {
  const env = resolveEnvironment(environment);
  const { token, pwCustomer } = paddleInitializationConfig(env, pwCustomerId);
  if (!token) {
    throw new Error("Paddle client-side token is not configured");
  }
  if (!clients[env]) {
    clients[env] = initializePaddle({
      token,
      pwCustomer,
    });
  }
  const client = await clients[env];
  if (!client) {
    throw new Error("Failed to initialize Paddle client");
  }
  return client;
}

export function tokenForResolvedEnvironment(environment?: PaddleEnvironment) {
  return tokenForEnvironment(resolveEnvironment(environment));
}

export function priceIdForEnvironment(environment: PaddleEnvironment) {
  return environment === "sandbox" ? PADDLE_SANDBOX_PRICE_ID : PADDLE_PRICE_ID;
}
export function price2IdForEnvironment(environment: PaddleEnvironment) {
  return environment === "sandbox" ? PADDLE_SANDBOX_PRICE2_ID : PADDLE_PRICE2_ID;
}

export function resolvePaddleEnvironmentFromRequest(input: any): PaddleEnvironment {
  if (!input) return PADDLE_ENVIRONMENT;
  if (typeof input === "string" && input.toLowerCase() === "sandbox") return "sandbox";
  if (typeof input === "boolean" && input) return "sandbox";
  if (typeof input === "object") {
    if (input.sandbox === true) return "sandbox";
    if (typeof input.mode === "string" && input.mode.toLowerCase() === "sandbox") return "sandbox";
  }
  return PADDLE_ENVIRONMENT;
}
