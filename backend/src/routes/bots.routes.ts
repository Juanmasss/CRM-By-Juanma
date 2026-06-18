import { Router } from "express";

import * as bots from "../controllers/bots.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(bots.listBots));
router.get("/:id", asyncHandler(bots.getBot));
router.post("/", asyncHandler(bots.createBot));
router.patch("/:id", asyncHandler(bots.updateBot));
router.delete("/:id", asyncHandler(bots.deleteBot));
router.put("/:id/flow", asyncHandler(bots.putBotFlow));

export default router;
