#!/usr/bin/env node

const https = require("https");
const { parse: parseURL } = require("url");
const { run } = require("micro");
const { key, cert } = require("./ssl");
const serializeError = require("serialize-error");

if (process.argv.length !== 4) {
  console.error("Usage: data-local postgres://localhost/db origin");
  process.exit(1);
}

const [, , url, expectedOrigin] = process.argv;

let db;
switch (parseURL(url).protocol) {
  case "mysql:":
    db = require("./mysql")(url);
    break;
  case "postgres:":
    db = require("./postgres")(url);
    break;
}

const server = https
  .createServer({ key, cert }, (req, res) => run(req, res, index))
  .listen(process.env.PORT || 2899, "127.0.0.1", () => {
    const { address, port } = server.address();
    console.log(`Listening on https://${address}:${port}`);
  });

async function index(req, res) {
  const { origin } = req.headers;
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (origin === expectedOrigin)
    res.setHeader("Access-Control-Allow-Origin", origin);
  if (req.method === "OPTIONS") return "";

  try {
    return await db(req, res);
  } catch (error) {
    res.statusCode = error.statusCode || 500;
    return serializeError(error);
  }
}
