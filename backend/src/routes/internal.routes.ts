import { Router } from "express";

import * as internal from "../controllers/internal.controller.js";
import { asyncHandler } from "../lib/http.js";
import { internalAuth } from "../middleware/internalAuth.js";

const router = Router();

// Todo lo interno exige x-internal-secret.
router.use(internalAuth);

router.post("/whatsapp/incoming", asyncHandler(internal.whatsappIncoming));

export default router;
