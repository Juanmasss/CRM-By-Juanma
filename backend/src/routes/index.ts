import { Router } from "express";

import bots from "./bots.routes.js";
import companies from "./companies.routes.js";
import contacts from "./contacts.routes.js";
import dashboard from "./dashboard.routes.js";
import leads from "./leads.routes.js";
import notes from "./notes.routes.js";
import pipelines from "./pipelines.routes.js";
import reports from "./reports.routes.js";
import stages from "./stages.routes.js";
import tags from "./tags.routes.js";
import tasks from "./tasks.routes.js";

const api = Router();

api.use("/pipelines", pipelines);
api.use("/stages", stages);
api.use("/leads", leads);
api.use("/contacts", contacts);
api.use("/companies", companies);
api.use("/tags", tags);
api.use("/notes", notes);
api.use("/tasks", tasks);
api.use("/dashboard", dashboard);
api.use("/reports", reports);
api.use("/bots", bots);

export default api;
