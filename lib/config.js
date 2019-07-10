import {existsSync, readFileSync, writeFileSync} from "fs";
import {homedir} from "os";
import {join} from "path";
import {createInterface} from "readline";
import open from "open";
import {argv} from "yargs";
import {exit} from "./errors";

const configFile = join(homedir(), ".observable-database-proxy");

export default async function getConfig() {
  const name = argv._[0];
  if (!name)
    return exit(`A name for the database proxy must be specified
Try: observable-database-proxy NAME`);

  let config = existsSync(configFile) && JSON.parse(readFileSync(configFile));
  if (!config || argv.reset) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const question = query =>
      new Promise(resolve => rl.question(query, resolve));

    if (!argv.reset) {
      // open browser
      const observable =
        process.env.NODE_ENV === "development"
          ? "observable.test:5000"
          : "observablehq.com";
      await open(
        `https://${observable}/settings/databases/choose-account?new&local&host=127.0.0.1&ssl=disabled`
      );
    }

    // paste secret (secret, origin, name)
    const secret = await question("Secret: ");
    const {name} = decodeSecret(secret); // TODO: errors
    if (name !== argv._[0])
      return exit(`Name mismatch: "${name}" (server), "${argv._[0]} (proxy)"`);

    // credentials
    const url = await question("PostgreSQL or MySQL Database URL: ");

    rl.close();

    if (!config) config = {};
    config[name] = {name, secret, url};
    writeFileSync(configFile, JSON.stringify(config, null, 2), {mode: 0o600});
  }

  if (!config[name]) return exit(`No configuration found for "${name}"`);
  const {secret, url} = config[name];
  const decoded = decodeSecret(secret);
  return {...decoded, url};
}

function decodeSecret(secret) {
  return JSON.parse(Buffer.from(secret, "base64"));
}
