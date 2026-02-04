// src/app.js
import express from "express";
import crypto from "crypto";
import { createRequire } from "module";

import patientsRouter from "./routes/patients.routes.js";
import schedulesRouter from "./routes/schedules.routes.js";
import professionalsRouter from "./routes/professionals.routes.js";
import companiesRouter from "./routes/companies.routes.js";
import insurancesRouter from "./routes/insurances.routes.js";
import specialitiesRouter from "./routes/specialities.routes.js";
import proceduresRouter from "./routes/procedures.routes.js";
import ordersRouter from "./routes/orders.routes.js";

import buildRoutesRouter from "./routes/__routes.routes.js";
import rpcRouter from "./routes/rpc.routes.js";
import { fail, ok } from "./utils/response.js";
import { HttpError } from "./clinicall/client.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const MIDDLEWARE_VERSION = process.env.MIDDLEWARE_VERSION || version;

const app = express();

// ✅ Request ID + log curto
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Middleware-Version", MIDDLEWARE_VERSION);

  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`
    );
  });

  next();
});

// JSON
app.use(express.json());

app.get("/health", (req, res) =>
  ok(res, req, { service: "clinicall-hub" })
);

// ✅ lista de rotas
app.use("/__routes", buildRoutesRouter(app));

// ✅ RPC
app.use("/rpc", rpcRouter);

// rotas do hub
app.use("/patients", patientsRouter);
app.use("/schedules", schedulesRouter);
app.use("/professionals", professionalsRouter);
app.use("/companies", companiesRouter);
app.use("/insurances", insurancesRouter);
app.use("/specialities", specialitiesRouter);
app.use("/procedures", proceduresRouter);
app.use("/orders", ordersRouter);

// handler de erro padrão
app.use((err, req, res, _next) => {
  if (err instanceof HttpError) {
    const mapping = {
      400: { status: 400, code: "VALIDATION_ERROR", message: "Erro de validação" },
      404: { status: 404, code: "NOT_FOUND", message: "Não encontrado" },
      409: { status: 409, code: "SCHEDULE_CONFLICT", message: "Horário indisponível" },
      500: { status: 500, code: "INTERNAL_ERROR", message: "Erro interno" },
      502: { status: 502, code: "CRM_ERROR", message: "Erro no CRM" },
      503: { status: 502, code: "CRM_ERROR", message: "Erro no CRM" },
      504: { status: 502, code: "CRM_ERROR", message: "Erro no CRM" },
    };

    const fallback = { status: 502, code: "CRM_ERROR", message: "Erro no CRM" };
    const resolved = mapping[err.status] || fallback;
    return fail(res, req, resolved);
  }

  const message = err?.message || String(err);
  return fail(res, req, {
    status: 500,
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    meta: { details: message },
  });
});

export default app;
