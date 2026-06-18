import { Router } from "express";

import * as tasks from "../controllers/tasks.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(tasks.listTasks));
router.get("/:id", asyncHandler(tasks.getTask));
router.post("/", asyncHandler(tasks.createTask));
router.patch("/:id", asyncHandler(tasks.updateTask));
router.delete("/:id", asyncHandler(tasks.deleteTask));

export default router;
