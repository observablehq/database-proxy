import {existsSync, readFileSync, writeFileSync} from "fs";
import {homedir} from "os";
import {join} from "path";
import {exit} from "./errors";

const configFile = join(homedir(), ".observable-database-proxy");

export function readConfig() {
  return existsSync(configFile) && JSON.parse(readFileSync(configFile));
}

export function readDecodedConfig(name) {
  const config = readConfig();
  if (name) {
    const raw = config[name];
    if (!raw) exit(`No configuration found for "${name}"`);
    return {...decodeSecret(raw.secret), url: raw.url};
  } else {
    return Object.values(config).map(c => ({
      ...decodeSecret(c.secret),
      url: c.url
    }));
  }
}

export function writeConfig(config) {
  writeFileSync(configFile, JSON.stringify(config, null, 2), {mode: 0o600});
}

export function decodeSecret(secret) {
  try {
    return JSON.parse(Buffer.from(secret, "base64"));
  } catch (error) {
    exit(error);
  }
}
