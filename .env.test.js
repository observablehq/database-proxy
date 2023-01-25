export const MSSQL_CREDENTIALS = env("MSSQL_CREDENTIALS");
export const MYSQL_CREDENTIALS = env("MYSQL_CREDENTIALS");
export const NODE_ENV = env("NODE_ENV");

function env(key, defaultValue) {
  const value = process.env[key]; // eslint-disable-line no-process-env
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing environment variable: ${key}`);
}
