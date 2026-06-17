import { Router } from "express";

import * as stages from "../controllers/stages.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.patch("/:id", asyncHandler(stages.updateStage));
router.delete("/:id", asyncHandler(stages.deleteStage));

export default router;
