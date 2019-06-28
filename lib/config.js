import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir, hostname } from "os";
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
    // await open("https://observablehq.com/settings/databases?new=local");
    const host = hostname() || "localhost";
    await open(
      `https://observable.test:5000/settings/databases?new&type=custom&host=${host}`
    );

    // paste secret (secret, origin, name)
    const secret = await question("Secret: ");
    const { name } = decodeSecret(secret); // TODO: errors

    rl.close();

    const config = [{ name, secret, credentials: { url } }];
    writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
  }

  const json = JSON.parse(readFileSync(configFile));
  const config = new Map();
  for (const { name, secret, credentials } of json) {
    const decoded = decodeSecret(secret);
    if (process.env.ALLOW_ORIGIN) decoded.origin = process.env.ALLOW_ORIGIN;
    config.set(name, { ...decoded, credentials });
    if (name !== decoded.name)
      console.warn(
        `Configured secret for client “${name}” doesn’t match (expected: “${
          decoded.name
        }”)`
      );
  }

  return config;
}

function decodeSecret(secret) {
  return JSON.parse(Buffer.from(secret, "base64"));
}
