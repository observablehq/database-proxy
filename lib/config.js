import {existsSync, readFileSync, writeFileSync} from "fs";
import {homedir} from "os";
import {join} from "path";
import {createInterface} from "readline";
import open from "open";
import {exit} from "./errors";

const configFile = join(homedir(), ".observable-database-proxy");

export default argv => {
  return async function getConfig() {
    const {name} = argv;
    let config = existsSync(configFile) && JSON.parse(readFileSync(configFile));
    if (config && !config[name])
      console.warn(`No configuration found for "${name}"`); // eslint-disable-line no-console
    if (!config || !config[name] || argv.reset) {
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
          `https://${observable}/settings/databases/choose-account?new&local&host=127.0.0.1&ssl=disabled&name=${name}`
        );
      }

      // paste secret (secret, origin, name, type, host, port, ssl)
      const secret = await question("Secret: ");
      const decoded = decodeSecret(secret);
      if (decoded.name !== name)
        return exit(
          `Name mismatch: "${decoded.name}" (server), "${name} (proxy)"`
        );

      // DB credentials
      const url = await question("PostgreSQL or MySQL Database URL: ");

      rl.close();

      if (!config) config = {};
      config[name] = {name, secret, url};
      writeFileSync(configFile, JSON.stringify(config, null, 2), {mode: 0o600});
    }

    const {secret, url} = config[name];
    const decoded = decodeSecret(secret);
    return {...decoded, url};
  };
};

function decodeSecret(secret) {
  try {
    return JSON.parse(Buffer.from(secret, "base64"));
  } catch (error) {
    exit(error);
  }
}
