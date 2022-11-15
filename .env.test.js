export const ORACLE_CREDENTIALS = env("ORACLE_CREDENTIALS");
export const MSSQL_CREDENTIALS = env("MSSQL_CREDENTIALS");
export const NODE_ENV = env("NODE_ENV");
export const LIB_DIR_PATH = env("LIB_DIR_PATH");

function env(key, defaultValue) {
  const value = process.env[key]; // eslint-disable-line no-process-env
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing environment variable: ${key}`);
}
