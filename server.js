import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "clinicall-hub" }));

// aqui depois a gente pluga /patients, /schedule etc

const PORT = process.env.PORT || 3333;
app.listen(PORT, "0.0.0.0", () => console.log(`API running on ${PORT}`));
