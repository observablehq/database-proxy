#!/usr/bin/env node

import http from "http";
import https from "https";
import {readFileSync} from "fs";
import {parse as parseURL} from "url";
import {run} from "micro";
import {createHmac, timingSafeEqual} from "crypto";
import {argv} from "yargs";
import serializeErrors from "./serialize-errors";
import {notFound, unauthorized} from "./errors";
import mysql from "./mysql";
import postgres from "./postgres";

export default config => {
  const {
    credentials: {url}
  } = config;
  config.type = parseURL(url).protocol.replace(":", "");
  switch (config.type) {
    case "mysql":
      config.handler = mysql(url);
      break;
    case "postgres":
      config.handler = postgres(url);
      break;
  }

  let server;
  const ssl = !!(argv.sslcert && argv.sslkey);
  const port = argv.port || 2899;

  if (ssl) {
    const sslcert = readFileSync(argv.sslcert);
    const sslkey = readFileSync(argv.sslkey);
    server = https.createServer({cert: sslcert, key: sslkey}, (req, res) =>
      run(req, res, serializeErrors(index))
    );
  } else {
    server = http.createServer((req, res) =>
      run(req, res, serializeErrors(index))
    );
  }

  server.listen(port, () => {
    console.log(`Database proxy running at http://127.0.0.1:${port}`); // eslint-disable-line no-console
    console.log("TODO REMOVE", config);
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
    const {name} = JSON.parse(payload);
    if (config.name !== name) throw notFound();
    const {type, origin, secret, handler} = config;

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
    if (req.method === "GET") return {type};

    // Make requests
    return handler(req, res);
  }
};
