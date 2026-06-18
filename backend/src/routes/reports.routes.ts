import { Router } from "express";

import * as reports from "../controllers/reports.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(reports.getReports));

export default router;
