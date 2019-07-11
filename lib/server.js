#!/usr/bin/env node
/* eslint-disable no-console */

import http from "http";
import https from "https";
import {readFileSync} from "fs";
import {run} from "micro";
import {createHmac, timingSafeEqual} from "crypto";
import serializeErrors from "./serialize-errors";
import {notFound, unauthorized, exit} from "./errors";
import mysql from "./mysql";
import postgres from "./postgres";

export default argv => {
  return function server(config) {
    const development = process.env.NODE_ENV === "development";
    const developmentOrigin = "https://worker.test:5000";

    const {
      name,
      type,
      url,
      ssl = "disabled",
      host = "127.0.0.1",
      port = 2899
    } = config;

    const handler =
      type === "mysql"
        ? mysql(url)
        : type === "postgres"
        ? postgres(url)
        : null;
    if (!handler) {
      return exit(`Unknown database type: ${type}`);
    }

    let server;
    const useSSL = ssl === "required";
    if (useSSL && (!argv.sslcert || !argv.sslkey)) {
      return exit(
        "SSL required, but no SSL certificate or private key configured"
      );
    }

    if (useSSL) {
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
      console.log(
        `Database proxy ${name} (${type}) running at http${
          useSSL ? `s` : ``
        }://${host}:${port}`
      );
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
      if (!authorization) throw unauthorized("Missing authorization header");

      const [payload, hmac] = authorization
        .split(".")
        .map(encoded => Buffer.from(encoded, "base64"));
      const {name} = JSON.parse(payload);
      if (config.name !== name) throw notFound();
      const {origin, secret} = config;

      if (development) {
        res.setHeader("Access-Control-Allow-Origin", developmentOrigin);
      } else {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }

      const valid = createHmac("sha256", Buffer.from(secret, "hex"))
        .update(payload)
        .digest();
      if (!timingSafeEqual(hmac, valid)) throw unauthorized("Invalid HMAC");

      // Authorized CORS
      if (
        req.headers.origin !== origin &&
        !(development && req.headers.origin === developmentOrigin)
      )
        throw unauthorized("Invalid CORS origin");

      // Expose type
      if (req.method === "GET") return {type};

      // Make requests
      return handler(req, res);
    }
  };
};
