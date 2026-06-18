import { Router } from "express";

import * as notes from "../controllers/notes.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.patch("/:id", asyncHandler(notes.updateNote));
router.delete("/:id", asyncHandler(notes.deleteNote));

export default router;
