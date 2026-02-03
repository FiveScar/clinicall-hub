// src/app.js
import express from "express";

// módulos (routers)
import patientsRouter from "./routes/patients.routes.js";
import professionalsRouter from "./routes/professionals.routes.js";
import schedulesRouter from "./routes/schedules.routes.js";

import companiesRouter from "./routes/companies.routes.js";
import insurancesRouter from "./routes/insurances.routes.js";
import specialitiesRouter from "./routes/specialities.routes.js";
import proceduresRouter from "./routes/procedures.routes.js";
import domainsRouter from "./routes/domains.routes.js";
import parametersRouter from "./routes/parameters.routes.js";
import ordersRouter from "./routes/orders.routes.js";

// auth interno do HUB (token/debug etc) — opcional se você tiver
import authRouter from "./routes/auth.routes.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "clinicall-hub" }));

/**
 * Rotas do HUB
 * Padrão: app.use("/prefix", router)
 */
app.use("/auth", authRouter);

app.use("/patients", patientsRouter);
app.use("/professionals", professionalsRouter); // inclui /performers também (via endpoints)
app.use("/schedules", schedulesRouter);

app.use("/companies", companiesRouter);
app.use("/insurances", insurancesRouter);
app.use("/specialities", specialitiesRouter);
app.use("/procedures", proceduresRouter);
app.use("/domains", domainsRouter);
app.use("/parameters", parametersRouter);
app.use("/orders", ordersRouter);

// 404 padrão (pra bater / e não ficar “Cannot GET /”)
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found", path: req.originalUrl });
});

// handler de erro padrão
app.use((err, _req, res, _next) => {
  const message = err?.message || String(err);
  res.status(500).json({ ok: false, error: "Internal Server Error", details: message });
});

export default app;
