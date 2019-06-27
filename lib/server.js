#!/usr/bin/env node

import https from "https";
import { parse as parseURL } from "url";
import { run } from "micro";
import { createHmac, timingSafeEqual } from "crypto";
import { key, cert } from "../ssl";
import serializeErrors from "./serialize-errors";
import { unauthorized } from "./errors";
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

  const server = https
    .createServer({ key, cert }, (req, res) =>
      run(req, res, serializeErrors(index))
    )
    .listen(2899, () => {
      const { address, port } = server.address();
      console.log(`Proxy running at https://${address}:${port}`);
      console.log(config); // TODO: redact
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
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      return "";
    }

    // Authorization
    const [, authorization] = (req.headers.authorization || "").split(/\s+/);
    if (!authorization) throw unauthorized();

    const [payload, hmac] = authorization
      .split(".")
      .map(encoded => Buffer.from(encoded, "base64"));
    const { type, origin, secret, handler } = config.get(payload.name);

    const valid = createHmac("sha256", Buffer.from(secret, "hex"))
      .update(payload)
      .digest();
    if (!timingSafeEqual(hmac, valid)) throw unauthorized();

    // Authorized CORS
    res.setHeader("Access-Control-Allow-Origin", origin);

    // Expose type
    if (req.method === "GET") return { type };

    // Make requests
    return handler(req, res);
  }
};
