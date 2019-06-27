import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createInterface } from "readline";
import open from "open";

const configFile = join(homedir(), ".observablehq");

export default async function getConfig() {
  if (!existsSync(configFile)) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const question = query =>
      new Promise(resolve => rl.question(query, resolve));

    // credentials
    const url = await question("Database URL: ");

    // open browser
    await open("https://observablehq.com/settings/database-clients/new?local");

    // paste token (secret, origin, name)
    const token = await question("Token: ");

    // TODO: JSON.parse errors
    const { name } = parseToken(token);

    rl.close();

    const config = [{ name, token, credentials: { url } }];

    writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
  }

  const config = new Map();
  for (const { name, token, credentials } of JSON.parse(
    readFileSync(configFile)
  ))
    config.set(name, { ...parseToken(token), credentials });

  return config;
}

function parseToken(token) {
  return JSON.parse(Buffer.from(token, "base64"));
}
