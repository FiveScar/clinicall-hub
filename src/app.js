// src/app.js
import express from "express";
import crypto from "crypto";
import { createRequire } from "module";

import authRouter from "./routes/auth.routes.js";

import patientsRouter from "./routes/patients.routes.js";
import schedulesRouter from "./routes/schedules.routes.js";
import professionalsRouter from "./routes/professionals.routes.js";
import companiesRouter from "./routes/companies.routes.js";
import insurancesRouter from "./routes/insurances.routes.js";
import specialitiesRouter from "./routes/specialities.routes.js";
import proceduresRouter from "./routes/procedures.routes.js";
import ordersRouter from "./routes/orders.routes.js";

import toolRouter from "./routes/tool.routes.js";
import buildRoutesRouter from "./routes/__routes.routes.js";
import rpcRouter from "./routes/rpc.routes.js";
import indexRouter from "./routes/index.routes.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const middlewareVersion = process.env.MIDDLEWARE_VERSION ?? version;

const app = express();

// ✅ versão do middleware
app.use((_req, res, next) => {
  res.setHeader("X-Middleware-Version", middlewareVersion);
  next();
});

// ✅ Request ID + log curto
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });

  next();
});

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "clinicall-hub" }));

app.get("/version", (_req, res) => {
  res.json({
    ok: true,
    service: "clinicall-hub",
    git_sha: process.env.GIT_SHA || "unknown",
    build_time: process.env.BUILD_TIME || "unknown",
  });
});

// Rotas
app.use("/auth", authRouter);
app.use("/index", indexRouter);
app.use("/__routes", buildRoutesRouter(app));
app.use("/rpc", rpcRouter);
app.use("/tool", toolRouter);

// HUB APIs
app.use("/patients", patientsRouter);
app.use("/schedules", schedulesRouter);
app.use("/schedule", schedulesRouter);
app.use("/professionals", professionalsRouter);
app.use("/companies", companiesRouter);
app.use("/insurances", insurancesRouter);
app.use("/specialities", specialitiesRouter);
app.use("/procedures", proceduresRouter);
app.use("/orders", ordersRouter);

// Domain tables
import domainsRouter from "./routes/domains.routes.js";
import parametersRouter from "./routes/parameters.routes.js";
import clinicRouter from "./routes/clinic.routes.js";
app.use("/domains", domainsRouter);
app.use("/parameters", parametersRouter);
app.use("/clinic", clinicRouter);

// ✅ Handler de erro (corrigido: erros públicos não viram 500)
app.use((err, req, res, _next) => {
  const requestId = req?.requestId;

  // Log estruturado mínimo
  console.error(
    JSON.stringify({
      requestId,
      method: req.method,
      path: req.originalUrl,
      errStatus: err?.status,
      errCode: err?.code,
      message: err?.message,
    })
  );

  if (err?.public) {
    const status = Number(err.status || 400);
    return res.status(status).json({
      ok: false,
      error: err.code || "BAD_REQUEST",
      details: err.publicMessage || err.message || "Erro",
      upstream: err.details || err.payload || null,
      requestId,
    });
  }

  const message = err?.message || String(err);
  return res.status(500).json({
    ok: false,
    error: "Internal Server Error",
    details: message,
    requestId,
  });
});

export default app;
