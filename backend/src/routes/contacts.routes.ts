import { Router } from "express";

import * as contacts from "../controllers/contacts.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(contacts.listContacts));
router.get("/:id", asyncHandler(contacts.getContact));
router.post("/", asyncHandler(contacts.createContact));
router.patch("/:id", asyncHandler(contacts.updateContact));
router.delete("/:id", asyncHandler(contacts.deleteContact));

export default router;
