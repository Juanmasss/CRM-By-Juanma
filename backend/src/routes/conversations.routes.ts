import { Router } from "express";

import * as conversations from "../controllers/conversations.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(conversations.listConversations));
router.get("/:id/messages", asyncHandler(conversations.listMessages));
router.post("/:id/messages", asyncHandler(conversations.postMessage));
router.patch("/:id/mode", asyncHandler(conversations.patchMode));
router.delete("/:id", asyncHandler(conversations.deleteConversation));

export default router;
