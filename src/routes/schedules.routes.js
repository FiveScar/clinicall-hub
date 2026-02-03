import express from "express";
import clinicall from "../clinicall/client.js"; // mantenha o caminho EXATO que você já usa no projeto

const router = express.Router();

/**
 * ✅ POST /schedules/search
 * Clinicall: POST /partners/schedule/v2/search
 */
router.post("/search", async (req, res, next) => {
  try {
    const data = await clinicall.post("/partners/schedule/v2/search", req.body);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * ✅ GET /schedules/status/patientStatus/simpleList
 * ✅ GET /schedules/status/scheduleStatus/simpleList
 * Clinicall: GET /partners/status/:type/simpleList
 */
router.get("/status/:type/simpleList", async (req, res, next) => {
  try {
    const { type } = req.params;

    const allowed = new Set(["patientStatus", "scheduleStatus"]);
    if (!allowed.has(type)) {
      return res.status(400).json({
        ok: false,
        error: "type inválido. Use patientStatus ou scheduleStatus.",
      });
    }

    const data = await clinicall.get(`/partners/status/${type}/simpleList`);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * 🧪 GET /schedules/confirm/:scheduleId
 * Clinicall: GET /partners/scheduleConfirm/:scheduleId
 *
 * Objetivo: inspecionar a resposta da Clinicall:
 * - ela pode devolver "code"/"confirmationCode"
 * - ou dados dizendo por que não localiza
 */
router.get("/confirm/:scheduleId", async (req, res, next) => {
  try {
    const { scheduleId } = req.params;

    if (!scheduleId) {
      return res.status(400).json({ ok: false, error: "scheduleId obrigatório" });
    }

    const data = await clinicall.get(`/partners/scheduleConfirm/${scheduleId}`);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * ❌/🧪 POST /schedules/confirm
 * Clinicall: POST /partners/scheduleConfirm
 *
 * IMPORTANTE:
 * A doc diz que confirma "informando o código de confirmação".
 * Então aqui nós:
 * - exigimos scheduleId
 * - e repassamos o body inteiro (pra aceitar scheduleId + code/confirmationCode/etc)
 */
router.post("/confirm", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { scheduleId } = body;

    if (!scheduleId) {
      return res.status(400).json({ ok: false, error: "scheduleId obrigatório" });
    }

    const data = await clinicall.post("/partners/scheduleConfirm", body);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * ❌/🧪 POST /schedules/cancel
 * Clinicall: POST /partners/scheduleCancel
 *
 * Aqui também repassamos o body inteiro (por segurança),
 * mas exigimos scheduleId.
 */
router.post("/cancel", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { scheduleId } = body;

    if (!scheduleId) {
      return res.status(400).json({ ok: false, error: "scheduleId obrigatório" });
    }

    const data = await clinicall.post("/partners/scheduleCancel", body);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
