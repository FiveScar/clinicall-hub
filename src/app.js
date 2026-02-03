// src/app.js
import express from "express";
import crypto from "crypto";

import patientsRouter from "./routes/patients.routes.js";
import schedulesRouter from "./routes/schedules.routes.js";
import professionalsRouter from "./routes/professionals.routes.js";
import companiesRouter from "./routes/companies.routes.js";

import buildRoutesRouter from "./routes/__routes.routes.js";
import rpcRouter from "./routes/rpc.routes.js"; // 👈 ADICIONADO

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

// ✅ lista de rotas
app.use("/__routes", buildRoutesRouter(app));

// ✅ RPC (antes das rotas normais ou depois, tanto faz)
app.use("/rpc", rpcRouter); // 👈 AQUI

// rotas do hub
app.use("/patients", patientsRouter);
app.use("/schedules", schedulesRouter);
app.use("/professionals", professionalsRouter);
app.use("/companies", companiesRouter);

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
