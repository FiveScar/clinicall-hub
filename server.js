import app from "./src/app.js";

const PORT = process.env.PORT || 3333;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API Clinicall Hub rodando na porta ${PORT}`);
});
