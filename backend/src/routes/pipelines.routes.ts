import { Router } from "express";

import * as pipelines from "../controllers/pipelines.controller.js";
import * as stages from "../controllers/stages.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(pipelines.listPipelines));
router.post("/", asyncHandler(pipelines.createPipeline));
router.patch("/:id", asyncHandler(pipelines.updatePipeline));
router.delete("/:id", asyncHandler(pipelines.deletePipeline));

// Etapas anidadas bajo un pipeline.
router.post("/:id/stages", asyncHandler(stages.createStage));
router.patch("/:id/stages/reorder", asyncHandler(stages.reorderStages));

export default router;
