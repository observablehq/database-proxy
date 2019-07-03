#!/usr/bin/env node

import http from "http";
import { parse as parseURL } from "url";
import { run } from "micro";
import { createHmac, timingSafeEqual } from "crypto";
import serializeErrors from "./serialize-errors";
import { notFound, unauthorized } from "./errors";
import mysql from "./mysql";
import postgres from "./postgres";

export default config => {
  for (const entry of config.values()) {
    const {
      credentials: { url }
    } = entry;
    entry.type = parseURL(url).protocol.replace(":", "");
    switch (entry.type) {
      case "mysql":
        entry.handler = mysql(url);
        break;
      case "postgres":
        entry.handler = postgres(url);
        break;
    }
  }

  http
    .createServer((req, res) =>
      run(req, res, serializeErrors(index))
    )
    .listen(2899, () => {
      console.log(`Database proxy running at http://127.0.0.1:2899`); // eslint-disable-line no-console
      // console.log(config);
    });

  function index(req, res) {
    // CORS
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      // Don't have an authorization header to check yet, so be permissive
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      return "";
    }

    // Authorization
    const [, authorization] = (req.headers.authorization || "").split(/\s+/);
    if (!authorization) throw unauthorized();

    const [payload, hmac] = authorization
      .split(".")
      .map(encoded => Buffer.from(encoded, "base64"));
    const { name } = JSON.parse(payload);
    if (!config.has(name)) throw notFound();
    const { type, origin, secret, handler } = config.get(name);

    if (process.env.NODE_ENV === "development") {
      res.setHeader("Access-Control-Allow-Origin", "https://worker.test:5000");
    } else {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    const valid = createHmac("sha256", Buffer.from(secret, "hex"))
      .update(payload)
      .digest();
    if (!timingSafeEqual(hmac, valid)) throw unauthorized();

    // Authorized CORS
    if (req.headers.origin !== origin) throw unauthorized();

    // Expose type
    if (req.method === "GET") return { type };

    // Make requests
    return handler(req, res);
  }
};
