import * as Sentry from "@sentry/node";
import type { Request, Response, NextFunction } from "express";

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.info("[sentry] SENTRY_DSN not set — Sentry disabled");
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      sendDefaultPii: false,
    });
    console.info("[sentry] Sentry initialized for Express API");
  } catch (err) {
    console.warn("[sentry] Failed to initialize Sentry:", (err as Error).message);
  }
}

export function sentryRequestHandler(): (req: Request, res: Response, next: NextFunction) => void {
  if (!process.env.SENTRY_DSN) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return Sentry.Handlers.requestHandler();
}

export function sentryErrorHandler(): (err: Error, req: Request, res: Response, next: NextFunction) => void {
  if (!process.env.SENTRY_DSN) {
    return (_err: Error, _req: Request, _res: Response, next: NextFunction) => next(_err);
  }
  return Sentry.Handlers.errorHandler();
}
