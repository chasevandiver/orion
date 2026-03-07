import type { Request, Response, NextFunction } from "express";

export function initSentry() {}
export function sentryRequestHandler() {
  return (_req: Request, _res: Response, next: NextFunction) => next();
}
export function sentryErrorHandler() {
  return (_err: Error, _req: Request, _res: Response, next: NextFunction) => next(_err);
}
