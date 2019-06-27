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

module.exports = ({ url, secret, expectedOrigin }) => {
  const type = parseURL(url).protocol.replace(":", "");

  let db;
  switch (type) {
    case "mysql":
      db = mysql(url);
      break;
    case "postgres":
      db = postgres(url);
      break;
  }

  const server = https
    .createServer({ key, cert }, (req, res) =>
      run(req, res, serializeErrors(index))
    )
    .listen(2899, "127.0.0.1", () => {
      const { address, port } = server.address();
      console.log(`${type} proxy running at https://${address}:${port}`);
    });

  function index(req, res) {
    // CORS
    const { origin } = req.headers;
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    );
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (origin === expectedOrigin)
      res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS") return "";

    // Authorization
    const [, authorization] = (req.headers.authorization || "").split(/\s+/);
    if (!authorization) throw unauthorized();

    const [payload, hmac] = authorization
      .split(".")
      .map(encoded => Buffer.from(encoded, "base64"));
    const valid = createHmac("sha256", Buffer.from(secret, "hex"))
      .update(payload)
      .digest();
    if (!timingSafeEqual(hmac, valid)) throw unauthorized();

    // Expose type
    if (req.method === "GET") return { type };

    // Make requests
    return db(req, res);
  }
};
