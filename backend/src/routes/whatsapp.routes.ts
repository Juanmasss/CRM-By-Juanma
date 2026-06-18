import { Router } from "express";

import * as whatsapp from "../controllers/whatsapp.controller.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

router.get("/connection", asyncHandler(whatsapp.getWhatsappConnection));
router.post("/connect", asyncHandler(whatsapp.postWhatsappConnect));
router.post("/disconnect", asyncHandler(whatsapp.postWhatsappDisconnect));

export default router;
