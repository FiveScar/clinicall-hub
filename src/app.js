// src/app.js
import express from "express";
import patientsRouter from "./routes/patients.routes.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "clinicall-hub" }));

// monta rotas
app.use("/patients", patientsRouter);

// handler de erro padrão
app.use((err, _req, res, _next) => {
  const message = err?.message || String(err);
  res.status(500).json({ ok: false, error: "Internal Server Error", details: message });
});

export default app;
