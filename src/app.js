// src/app.js
import express from "express";
import crypto from "crypto";

import authRouter from "./routes/auth.routes.js";

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

import indexRouter from "./routes/index.routes.js";

const app = express();

// ✅ Request ID + log curto
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

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

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "clinicall-hub" })
);

// ✅ auth debug
app.use("/auth", authRouter);

// ✅ index (telefone -> paciente)
app.use("/index", indexRouter);

// ✅ lista de rotas
app.use("/__routes", buildRoutesRouter(app));

// ✅ RPC
app.use("/rpc", rpcRouter);

// rotas do hub
app.use("/patients", patientsRouter);
app.use("/schedules", schedulesRouter);
app.use("/schedule", schedulesRouter);
app.use("/professionals", professionalsRouter);
app.use("/companies", companiesRouter);
app.use("/insurances", insurancesRouter);
app.use("/specialities", specialitiesRouter);
app.use("/procedures", proceduresRouter);
app.use("/orders", ordersRouter);

// handler de erro padrão
app.use((err, req, res, _next) => {
  const message = err?.message || String(err);
  res.status(500).json({
    ok: false,
    error: "Internal Server Error",
    details: message,
    requestId: req?.requestId,
  });
});

export default app;
