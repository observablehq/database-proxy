/* eslint-disable no-console */

import {createInterface} from "readline";
import open from "open";
import {
  readConfig,
  readDecodedConfig,
  writeConfig,
  decodeSecret,
} from "./config.js";
import {server} from "./server.js";
import {exit} from "./errors.js";

export function start(argv) {
  const config = readDecodedConfig(argv.name);
  server(config, argv);
}

export async function add(argv, reset = false) {
  const {name, sslkey, sslcert} = argv;
  let config = readConfig();
  let url;
  let token;
  let server_host;
  let path;
  let username;
  let password;

  if (config && config[name] && !reset)
    exit(`A database proxy for "${name}" already exists`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const question = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  if (reset) {
    if (!config[name]) exit(`No configuration found for "${name}"`);
    url = config[name].url;
  } else {
    const wantsSSL = sslkey || sslcert;
    // open browser
    const observable =
      process.env.NODE_ENV === "development"
        ? "observable.test:5000"
        : "observablehq.com";
    await open(
      `https://${observable}/settings/databases/choose-account?new&local&host=127.0.0.1&ssl=${
        wantsSSL ? "required" : "disabled"
      }&name=${name}`
    );
  }

  // paste secret (secret, origin, name, type, host, port, ssl)
  const secret = await question("Secret: ");
  const decoded = decodeSecret(secret);
  if (decoded.name !== name)
    return exit(`Name mismatch: "${decoded.name}" (server), "${name} (proxy)"`);

  // DB credentials
  if (!reset) {
    switch (decoded.type) {
      case "databricks":
        token = await question("Databricks token: ");
        server_host = await question("Databricks server host: ");
        path = await question("Databricks path: ");
        break;
      case "oracle":
        username = await question("Username: ");
        password = await question("Password: ");
        url = await question("Connection String: ");
        break;
      default:
        url = await question(
          "PostgreSQL, MySQL, or Snowflake Database URL (including username and password): "
        );
    }
  }

  rl.close();

  if (!config) config = {};
  config[name] =
    decoded.type === "databricks"
      ? {
          name,
          secret,
          token,
          server_host,
          path,
        }
      : decoded.type === "oracle"
      ? {
          name,
          secret,
          username,
          password,
          url,
        }
      : {name, secret, url};

  writeConfig(config);

  console.log(`Configuration ${reset ? `reset` : `added`} for "${name}"`);
}

export function reset(argv) {
  add(argv, true);
}

export function remove(argv) {
  const {name} = argv;
  const config = readConfig();
  if (!config) exit(`No database proxies configured`);
  if (!config[name]) exit(`No configuration found for "${name}"`);
  delete config[name];
  writeConfig(config);
  console.log(`Removed database proxy "${name}"`);
}

export function list() {
  const config = readDecodedConfig();
  if (!config) exit(`No database proxies configured`);
  console.log(
    config
      .map(
        (c) => `${c.name} (${c.type}) ${c.ssl === "required" ? `(SSL)` : ``}`
      )
      .join("\n")
  );
}
