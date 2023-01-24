import JSONStream from "JSONStream";
import {json} from "micro";
import mysql, {createConnection} from "mysql2";
import {failedCheck} from "./errors.js";

const {Types, ConnectionConfig} = mysql;

export async function query(req, res, pool) {
  const {sql, params} = await json(req);
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  let fields;
  let rowCount = 0;
  let bytes = 0;
  try {
    await new Promise((resolve, reject) => {
      const stream = pool
        .query({sql, timeout: 240e3}, params)
        .once("fields", (f) => {
          res.write(`{"schema":${JSON.stringify(schema((fields = f)))}`);
        })
        .stream()
        .on("end", resolve)
        .on("error", (error) => {
          if (!stream.destroyed) stream.destroy();
          reject(error);
        })
        .once("readable", () => clearInterval(keepAlive))
        .pipe(JSONStream.stringify(`,"data":[`, ",", "]}"))
        .on("data", (chunk) => {
          bytes += chunk.length;
          rowCount++;
          if (rowCount && rowCount % 2e3 === 0)
            req.log({
              progress: {
                rows: rowCount,
                fields: fields.length,
                bytes,
                done: false,
              },
            });
        });
      stream.pipe(res, {end: false});
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  } finally {
    clearInterval(keepAlive);
  }

  req.log({
    progress: {
      rows: rowCount,
      fields: fields ? fields.length : 0,
      bytes,
      done: true,
    },
  });

  res.end();
}

export async function queryStream(req, res, pool) {
  const {sql, params} = await json(req);
  res.setHeader("Content-Type", "text/plain");
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  let fields;
  let rowCount = 0;
  let bytes = 0;

  try {
    await new Promise((resolve, reject) => {
      const stream = pool
        .query({sql, timeout: 240e3}, params)
        .once("fields", (f) => {
          res.write(JSON.stringify(schema((fields = f))));
          res.write("\n");
        })
        .stream()
        .on("end", resolve)
        .on("error", (error) => {
          if (!stream.destroyed) stream.destroy();
          reject(error);
        })
        .once("readable", () => clearInterval(keepAlive))
        .pipe(JSONStream.stringify("", "\n", "\n"))
        .on("data", (chunk) => {
          bytes += chunk.length;
          rowCount++;
          if (rowCount % 2e3 === 0)
            req.log({
              progress: {
                rows: rowCount,
                fields: fields.length,
                bytes,
                done: false,
              },
            });
        });
      stream.pipe(res, {end: false});
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  } finally {
    clearInterval(keepAlive);
  }

  req.log({
    progress: {
      rows: rowCount,
      fields: fields ? fields.length : 0,
      bytes,
      done: true,
    },
  });

  res.end();
}

const READ_ONLY = new Set(["SELECT", "SHOW DATABASES", "SHOW VIEW", "USAGE"]);
export async function check(req, res, pool) {
  const rows = await new Promise((resolve, reject) => {
    pool.query("SHOW GRANTS FOR CURRENT_USER", (error, results) => {
      error ? reject(failedCheck(error.message)) : resolve(results);
    });
  });
  const grants = [].concat(
    ...rows.map((grant) =>
      Object.values(grant)[0]
        .match(/^GRANT (.+) ON/)[1]
        .split(", ")
    )
  );
  const permissive = grants.filter((g) => !READ_ONLY.has(g));
  if (permissive.length)
    throw failedCheck(
      `User has too permissive grants: ${permissive.join(", ")}`
    );

  return {ok: true};
}

export default (url) => async (req, res) => {
  const config = ConnectionConfig.parseUrl(url);

  // Unless spcified as a property of the url connection string, ss is used with the default.
  // See https://dev.mysql.com/doc/connector-j/8.0/en/connector-j-connp-props-security.html#cj-conn-prop_sslMode
  if (config.sslMode !== "DISABLED") {
    config.ssl = {};
    // the mysql2.createConnection method is not happy if we pass any extra properties not recognized by it.
    delete config.sslMode;
  }

  const connection = createConnection({
    ...config,
  });

  if (req.method === "POST") {
    if (req.url === "/query") return query(req, res, connection);
    if (req.url === "/query-stream") return queryStream(req, res, connection);
    if (req.url === "/check") return check(req, res, connection);
  }

  throw notFound();
};

function schema(fields) {
  return {
    type: "array",
    items: {
      type: "object",
      properties: fields.reduce(
        (schema, {name, type, charsetNr}) => (
          (schema[name] = dataTypeSchema({type, charsetNr})), schema
        ),
        {}
      ),
    },
  };
}

// https://github.com/mysqljs/mysql/blob/5569e02ad72789f4b396d9a901f0390fe11b5b4e/lib/protocol/constants/types.js
// https://github.com/mysqljs/mysql/blob/5569e02ad72789f4b396d9a901f0390fe11b5b4e/lib/protocol/packets/RowDataPacket.js#L53
const boolean = ["null", "boolean"],
  integer = ["null", "integer"],
  number = ["null", "number"],
  object = ["null", "object"],
  string = ["null", "string"];
function dataTypeSchema({type, charsetNr}) {
  switch (type) {
    case Types.BIT:
      return {type: boolean};
    case Types.TINY:
      return {type: integer, tiny: true};
    case Types.SHORT:
      return {type: integer, short: true};
    case Types.LONG:
      return {type: integer, long: true};
    case Types.INT24:
      return {type: number, int24: true};
    case Types.YEAR:
      return {type: number, year: true};
    case Types.FLOAT:
      return {type: number, float: true};
    case Types.DOUBLE:
      return {type: number, double: true};
    case Types.DECIMAL:
      return {type: number, decimal: true};
    case Types.NEWDECIMAL:
      return {type: number, newdecimal: true};
    case Types.TIMESTAMP:
    case Types.DATE:
    case Types.DATETIME:
    case Types.NEWDATE:
    case Types.TIMESTAMP2:
    case Types.DATETIME2:
    case Types.TIME2:
      return {type: string, date: true};
    case Types.LONGLONG: // TODO
      return {type: number, bigint: true};
    case Types.TINY_BLOB:
    case Types.MEDIUM_BLOB:
    case Types.LONG_BLOB:
    case Types.BLOB:
    case Types.VAR_STRING:
    case Types.VARCHAR:
    case Types.STRING:
      return charsetNr === 63 // binary
        ? {type: object, buffer: true}
        : {type: string};
    case Types.JSON:
      return {type: object, json: true};
    case Types.TIME: // TODO
    case Types.ENUM: // TODO
    case Types.SET: // TODO
    case Types.GEOMETRY: // TODO
    case Types.NULL: // TODO
    default:
      return {type: string};
  }
}
