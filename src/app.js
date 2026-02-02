import express from "express";
import patientsRoutes from "./routes/patients.routes.js";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "clinicall-hub" })
);

app.use("/patients", patientsRoutes);

export default app;
