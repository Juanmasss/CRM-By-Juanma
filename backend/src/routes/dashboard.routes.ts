import { Router } from "express";

import * as dashboard from "../controllers/dashboard.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(dashboard.getDashboard));

export default router;
