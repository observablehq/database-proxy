import {json} from "micro";
import pg from "pg";
import QueryStream from "pg-query-stream";
import JSONStream from "JSONStream";
import {validateQueryPayload} from "./validate.js";
import {badRequest, failedCheck, notFound} from "./errors.js";

import Pools from "./pools.js";

const {Pool} = pg;

export const pools = new Pools(
  ({host, port, database, user, password, ssl}) =>
    new pg.Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: ssl === "required" ? {rejectUnauthorized: false} : false,
      connectionTimeoutMillis: 25e3,
      statement_timeout: 240e3,
      max: 30,
    })
);

export default (url) => async (req, res) => {
  const connection = new Pool({connectionString: url});

  if (req.method === "POST") {
    if (req.url === "/query") return query(req, res, connection);
    if (req.url === "/query-stream") return queryStream(req, res, connection);
    if (req.url === "/check") return check(req, res, connection);
  }

  throw notFound();
};

export async function query(req, res, pool) {
  const body = await json(req);
  if (!validateQueryPayload(body)) throw badRequest();
  const {sql, params} = body;
  const client = await pool.connect();
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  try {
    let rowCount = 0;
    let bytes = 0;
    const queryStream = new QueryStream(sql, params);
    try {
      const stream = await client.query(queryStream);

      await new Promise((resolve, reject) => {
        stream
          .on("end", resolve)
          .on("error", reject)
          .once("readable", () => clearInterval(keepAlive))
          .once("readable", () => {
            res.write(`{"schema":${JSON.stringify(schema(queryStream))}`);
          })
          .pipe(JSONStream.stringify(`,"data":[`, ",", "]}"))
          .on("data", (chunk) => {
            bytes += chunk.length;
            rowCount++;
            if (rowCount && rowCount % 2e3 === 0)
              req.log({
                progress: {
                  rows: rowCount,
                  fields: queryStream.cursor._result.fields.length,
                  bytes,
                  done: false,
                },
              });
          })
          .pipe(res);
      });
    } catch (error) {
      if (!error.statusCode) error.statusCode = 400;
      throw error;
    }
    req.log({
      progress: {
        rows: rowCount,
        fields: queryStream.cursor._result.fields.length,
        bytes,
        done: true,
      },
    });
  } finally {
    clearInterval(keepAlive);
    client.release();
  }
}

export async function queryStream(req, res, pool) {
  const body = await json(req);
  if (!validateQueryPayload(body)) throw badRequest();
  const {sql, params} = body;
  const client = await pool.connect();
  res.setHeader("Content-Type", "text/plain");
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  try {
    let rowCount = 0;
    let bytes = 0;

    const queryStream = new QueryStream(sql, params);
    req.on("close", () => queryStream.cursor.close());
    try {
      const stream = await client.query(queryStream);

      await new Promise((resolve, reject) => {
        stream
          .on("end", resolve)
          .on("error", reject)
          .once("readable", () => clearInterval(keepAlive))
          .once("readable", () => {
            res.write(JSON.stringify(schema(queryStream)));
            res.write("\n");
          })
          .pipe(JSONStream.stringify("", "\n", "\n"))
          .on("data", (chunk) => {
            bytes += chunk.length;
            rowCount++;
            if (rowCount % 2e3 === 0) {
              req.log({
                progress: {
                  rows: rowCount,
                  fields: queryStream.cursor._result.fields.length,
                  bytes,
                  done: false,
                },
              });
            }
          })
          .pipe(res);
      });
    } catch (error) {
      if (!error.statusCode) error.statusCode = 400;
      throw error;
    }
    req.log({
      progress: {
        rows: rowCount,
        fields: queryStream.cursor._result.fields.length,
        bytes,
        done: true,
      },
    });
  } finally {
    clearInterval(keepAlive);
    client.release();
  }
}

export async function check(req, res, pool) {
  // TODO: use table_privileges and column_privileges to ensure public
  // privileges aren't too permissive?
  const {rows} = await pool.query(`
    SELECT DISTINCT privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = user

    UNION

    SELECT DISTINCT privilege_type
    FROM information_schema.role_column_grants
    WHERE grantee = user
  `);

  const privileges = rows.map((r) => r.privilege_type);
  const permissive = privileges.filter((p) => p !== "SELECT");
  if (permissive.length)
    throw failedCheck(
      `User has too permissive privileges: ${permissive.join(", ")}`
    );

  return {ok: true};
}

function schema(queryStream) {
  return {
    type: "array",
    items: {
      type: "object",
      properties: queryStream.cursor._result.fields.reduce(
        (schema, {name, dataTypeID}) => (
          (schema[name] = dataTypeSchema(dataTypeID)), schema
        ),
        {}
      ),
    },
  };
}

// https://www.postgresql.org/docs/9.6/datatype.html
const array = ["null", "array"],
  boolean = ["null", "boolean"],
  integer = ["null", "integer"],
  number = ["null", "number"],
  object = ["null", "object"],
  string = ["null", "string"];
function dataTypeSchema(dataTypeID) {
  switch (dataTypeID) {
    // https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js#L166
    case 18:
      return {type: string, char: true};
    case 20: //parseBigInteger // int8
      return {type: string, bigint: true};
    case 21: //parseInteger // int2
      return {type: integer, int16: true};
    case 23: //parseInteger // int4
      return {type: integer, int32: true};
    case 24:
      return {type: string, regproc: true};
    case 26: //parseInteger // oid
      return {type: integer, oid: true};
    case 700: //parseFloat // float4/real
      return {type: number, float32: true};
    case 701: //parseFloat // float8/double
      return {type: number, float64: true};
    case 16: //parseBool
      return {type: boolean};
    case 1082: //parseDate // date
    case 1114: //parseDate // timestamp without timezone
    case 1184: //parseDate // timestamp
      return {type: string, date: true};
    case 600: //parsePoint // point
      return {type: object};
    case 651: //parseStringArray // cidr[]
      return {type: array, items: {type: string}};
    case 718: //parseCircle // circle
      return {type: object};
    case 1000: //parseBoolArray
      return {type: array, items: {type: boolean}};
    case 1001: //parseByteArray
      return {type: array, items: {type: object, buffer: true}};
    case 1002:
      return {type: array, items: {type: string, char: true}};
    case 1005: //parseIntegerArray // _int2
      return {type: array, items: {type: integer, int16: true}};
    case 1007: //parseIntegerArray // _int4
      return {type: array, items: {type: integer, int32: true}};
    case 1028: //parseIntegerArray // oid[]
      return {type: array, items: {type: integer, oid: true}};
    case 1016: //parseBigIntegerArray // _int8
      return {type: array, items: {type: string, bigint: true}};
    case 1017: //parsePointArray // point[]
      return {type: array, items: {type: object}};
    case 1021: //parseFloatArray // _float4
      return {type: array, items: {type: number, float32: true}};
    case 1022: //parseFloatArray // _float8
      return {type: array, items: {type: number, float64: true}};
    case 1231: //parseFloatArray // _numeric
      return {type: array, items: {type: string, numeric: true}};
    case 1014: //parseStringArray //char
      return {type: array, items: {type: string, char: true}};
    case 1015: //parseStringArray //varchar
      return {type: array, items: {type: string, varchar: true}};
    case 1008: //parseStringArray
      return {type: array, items: {type: string, regproc: true}};
    case 1009: //parseStringArray
      return {type: array, items: {type: string, text: true}};
    case 1040: //parseStringArray // macaddr[]
    case 1041: //parseStringArray // inet[]
      return {type: array, items: {type: string}};
    case 1115: //parseDateArray // timestamp without time zone[]
    case 1182: //parseDateArray // _date
    case 1185: //parseDateArray // timestamp with time zone[]
      return {type: array, items: {type: string, date: true}};
    case 1186: //parseInterval
      return {type: object};
    case 1187: //parseIntervalArray
      return {type: array, items: {type: object}};
    case 17: //parseByteA
      return {type: object, buffer: true};
    case 114: //JSON.parse.bind(JSON) // json
    case 3802: //JSON.parse.bind(JSON) // jsonb
      return {type: object};
    case 199: //parseJsonArray // json[]
    case 3807: //parseJsonArray // jsonb[]
      return {type: array, items: {type: object}};
    case 3907: //parseStringArray // numrange[]
    case 2951: //parseStringArray // uuid[]
    case 791: //parseStringArray // money[]
    case 1183: //parseStringArray // time[]
    case 1270: //parseStringArray // timetz[]
      return {type: array, items: {type: string}};
    // https://github.com/brianc/node-pg-types/blob/master/lib/binaryParsers.js#L236
    case 1700: //parseNumeric
      return {type: string, numeric: true};
    case 25: //parseText
      return {type: string, text: true};
    default:
      return {type: string};
  }
}
