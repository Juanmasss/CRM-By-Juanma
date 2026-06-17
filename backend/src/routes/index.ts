import { Router } from "express";

import companies from "./companies.routes.js";
import contacts from "./contacts.routes.js";
import leads from "./leads.routes.js";
import pipelines from "./pipelines.routes.js";
import stages from "./stages.routes.js";

const api = Router();

api.use("/pipelines", pipelines);
api.use("/stages", stages);
api.use("/leads", leads);
api.use("/contacts", contacts);
api.use("/companies", companies);

export default api;
