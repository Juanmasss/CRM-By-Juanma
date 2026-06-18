import { Router } from "express";

import * as leads from "../controllers/leads.controller.js";
import * as notes from "../controllers/notes.controller.js";
import * as tags from "../controllers/tags.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(leads.listLeads));
router.get("/:id", asyncHandler(leads.getLead));
router.post("/", asyncHandler(leads.createLead));
router.patch("/:id", asyncHandler(leads.updateLead));
router.delete("/:id", asyncHandler(leads.deleteLead));

// Campos personalizados (upsert).
router.patch("/:id/custom-fields", asyncHandler(leads.patchLeadCustomFields));

// Etiquetas asociadas al lead.
router.post("/:id/tags", asyncHandler(tags.addTagToLead));
router.delete("/:id/tags/:tagId", asyncHandler(tags.removeTagFromLead));

// Notas anidadas bajo el lead.
router.get("/:id/notes", asyncHandler(notes.listLeadNotes));
router.post("/:id/notes", asyncHandler(notes.createLeadNote));

export default router;
