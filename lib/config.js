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
    // await open("https://observablehq.com/settings/databases?new=local");
    await open(
      "https://observable.test:5000/settings/databases?new&type=custom&host=localhost"
    );

    // paste token (secret, origin, name)
    const token = await question("Token: ");
    const { name } = decodeToken(token); // TODO: errors

    rl.close();

    const config = [{ name, token, credentials: { url } }];
    writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
  }

  const json = JSON.parse(readFileSync(configFile));
  const config = new Map();
  for (const { name, token, credentials } of json) {
    const decoded = decodeToken(token);
    if (name !== decoded.name)
      console.warn(
        `Configured token for client “${name}” doesn’t match (expected: “${
          decoded.name
        }”)`
      );
    config.set(name, { ...decoded, credentials });
  }

  return config;
}

function decodeToken(token) {
  return JSON.parse(Buffer.from(token, "base64"));
}
