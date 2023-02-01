export const MSSQL_TEST_CREDENTIALS = env("MSSQL_TEST_CREDENTIALS");
export const MYSQL_TEST_CREDENTIALS = env("MYSQL_TEST_CREDENTIALS");
export const POSTGRES_TEST_CREDENTIALS = env("POSTGRES_TEST_CREDENTIALS");
export const SNOWFLAKE_TEST_CREDENTIALS = env("SNOWFLAKE_TEST_CREDENTIALS");
export const NODE_ENV = env("NODE_ENV");

function env(key, defaultValue) {
  const value = process.env[key]; // eslint-disable-line no-process-env
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing environment variable: ${key}`);
}
