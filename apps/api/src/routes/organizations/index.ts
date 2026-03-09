import { Router } from "express";
import { uploadLogoRouter } from "./upload-logo.js";

export const organizationsRouter = Router();

organizationsRouter.use(uploadLogoRouter);
