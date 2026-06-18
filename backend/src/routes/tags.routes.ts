import { Router } from "express";

import * as tags from "../controllers/tags.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(tags.listTags));
router.post("/", asyncHandler(tags.createTag));
router.patch("/:id", asyncHandler(tags.updateTag));
router.delete("/:id", asyncHandler(tags.deleteTag));

export default router;
