import {existsSync, readFileSync, writeFileSync} from "fs";
import {homedir} from "os";
import {join} from "path";
import {createInterface} from "readline";
import open from "open";
import {argv} from "yargs";

const configFile = join(homedir(), ".observablehq-database-proxy");

export default async function getConfig() {
  const reset = argv._[0] === "reset";
  if (!existsSync(configFile) || reset) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const question = query =>
      new Promise(resolve => rl.question(query, resolve));

    if (!reset) {
      // open browser
      const observable =
        process.env.NODE_ENV === "development"
          ? "observable.test:5000"
          : "observablehq.com";
      await open(
        `https://${observable}/settings/databases?new&local&host=127.0.0.1&ssl=disabled`
      );
    }

    // paste secret (secret, origin, name)
    const secret = await question("Secret: ");
    const {name} = decodeSecret(secret); // TODO: errors

    // credentials
    const url = await question("PostgreSQL or MySQL Database URL: ");

    rl.close();

    const config = {name, secret, url};
    writeFileSync(configFile, JSON.stringify(config, null, 2), {mode: 0o600});
  }

  const json = JSON.parse(readFileSync(configFile));
  const {secret, url} = json;
  const decoded = decodeSecret(secret);
  return {...decoded, url};
}

function decodeSecret(secret) {
  return JSON.parse(Buffer.from(secret, "base64"));
}
