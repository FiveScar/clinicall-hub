// src/routes/__routes.routes.js
import express from "express";
import { ok } from "../utils/response.js";

/**
 * Lista rotas do Express de forma dinâmica.
 * Funciona bem para app.use("/prefix", router) e router.METHOD("/path", ...)
 */
function listRoutesFromStack(stack, basePath = "") {
  const routes = [];

  for (const layer of stack || []) {
    // rota direta (app.get/post etc)
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {})
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());

      const path = `${basePath}${layer.route.path}`.replace(/\/+/g, "/");
      routes.push({ methods, path });
      continue;
    }

    // router montado via app.use("/prefix", router)
    if (layer.name === "router" && layer.handle && layer.handle.stack) {
      // layer.regexp contém o prefixo, mas é chato de reconstruir com 100% fidelidade.
      // Aqui a gente tenta extrair um prefixo humano quando possível.
      const prefix = extractMountPath(layer) || "";
      const nextBase = `${basePath}${prefix}`.replace(/\/+/g, "/");
      routes.push(...listRoutesFromStack(layer.handle.stack, nextBase));
    }
  }

  return routes;
}

/**
 * Tentativa pragmática de extrair o prefixo do app.use("/xxx", router)
 * Nem sempre dá pra reconstruir perfeito; quando não dá, volta "".
 */
function extractMountPath(layer) {
  const src = layer?.regexp?.source;
  if (!src) return "";

  // exemplos comuns gerados pelo Express: ^\/patients\/?(?=\/|$)
  const match = src.match(/^\^\\\/([A-Za-z0-9\-_]+)\\\/\?\(\?\=\\\/\|\$\)/);
  if (match && match[1]) return `/${match[1]}`;

  // outro padrão: ^\/patients\/?(?=\/|$)
  const match2 = src.match(/^\^\\\/(.+?)\\\/\?\(\?\=\\\/\|\$\)/);
  if (match2 && match2[1] && !match2[1].includes(".*")) {
    return `/${match2[1].replace(/\\\//g, "/")}`;
  }

  return "";
}

function sortRoutes(routes) {
  return routes
    .map((r) => ({
      methods: r.methods?.length ? r.methods : ["USE"],
      path: r.path || "/",
    }))
    .sort((a, b) => (a.path + a.methods.join(",")).localeCompare(b.path + b.methods.join(",")));
}

/**
 * Factory: precisa do app pra ler app._router.stack
 */
export default function buildRoutesRouter(app) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const stack = app?._router?.stack || [];
    const routes = sortRoutes(listRoutesFromStack(stack, ""));

    ok(res, req, {
      service: "clinicall-hub",
      count: routes.length,
      routes,
    });
  });

  return router;
}
