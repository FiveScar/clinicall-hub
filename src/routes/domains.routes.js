// src/routes/domains.routes.js
import { Router } from "express";
import clinicall from "../clinicall/client.js";

const router = Router();

function searchBody(body) {
  return {
    argument: body?.argument ?? "",
    page: body?.page ?? 0,
    sizePage: body?.sizePage ?? 25,
    fieldSort: body?.fieldSort ?? "name",
    sortDirection: body?.sortDirection ?? "asc",
  };
}

const domainEndpoints = {
  gender:      "/partners/gender/search",
  civilStatus: "/partners/civilStatus/search",
  city:        "/partners/city/search",
  state:       "/partners/state/search",
  country:     "/partners/country/search",
  addressType: "/partners/addressType/search",
  race:        "/partners/race/search",
};

for (const [name, path] of Object.entries(domainEndpoints)) {
  router.post(`/${name}/search`, async (req, res, next) => {
    try {
      const data = await clinicall.request(path, { method: "POST", body: searchBody(req.body) });
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });
}

export default router;
