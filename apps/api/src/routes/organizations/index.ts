import { Router } from "express";
import { uploadLogoRouter } from "./upload-logo.js";
import { extractBrandRouter } from "./extract-brand.js";

export const organizationsRouter = Router();

organizationsRouter.use(uploadLogoRouter);
organizationsRouter.use(extractBrandRouter);
