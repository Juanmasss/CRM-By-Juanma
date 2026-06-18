import { startServer } from "./server.js";
import { wa } from "./whatsapp.js";

// Levanta el HTTP y arranca la conexión a WhatsApp Web (emite el primer QR).
startServer();
void wa.start();
