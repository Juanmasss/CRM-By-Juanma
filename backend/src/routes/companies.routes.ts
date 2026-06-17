import { Router } from "express";

import * as companies from "../controllers/companies.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/", asyncHandler(companies.listCompanies));
router.get("/:id", asyncHandler(companies.getCompany));
router.post("/", asyncHandler(companies.createCompany));
router.patch("/:id", asyncHandler(companies.updateCompany));
router.delete("/:id", asyncHandler(companies.deleteCompany));

export default router;
