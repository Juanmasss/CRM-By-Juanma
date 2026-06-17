import { Router } from "express";

import * as leads from "../controllers/leads.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(leads.listLeads));
router.get("/:id", asyncHandler(leads.getLead));
router.post("/", asyncHandler(leads.createLead));
router.patch("/:id", asyncHandler(leads.updateLead));
router.delete("/:id", asyncHandler(leads.deleteLead));

export default router;
