import Ajv from "ajv";
import {json} from "micro";
import oracledb from "oracledb";
import JSONStream from "JSONStream";
import {Transform} from "stream";
import {badRequest, failedCheck, notImplemented} from "./errors.js";
import pools from "./pools.js";

const READ_ONLY = new Set(["SELECT", "USAGE", "CONNECT"]);

const ajv = new Ajv();
const validate = ajv.compile({
  type: "object",
  additionalProperties: false,
  required: ["sql"],
  properties: {
    sql: {type: "string", minLength: 1},
    params: {type: "array"},
  },
});

export async function queryStream(req, res, pool) {
  const db = await pool;
  const connection = await db.getConnection();
  const body = await json(req);

  if (!validate(body)) throw badRequest();

  res.setHeader("Content-Type", "text/plain");
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  let {sql, params = []} = body;

  try {
    await new Promise((resolve, reject) => {
      const columnNameMap = new Map();
      const stream = connection.queryStream(sql, params, {
        extendedMetaData: true,
      });

      stream
        .on("error", function (e) {
          this.destroy();
          reject(e);
        })
        .once("metadata", () => clearInterval(keepAlive))
        .on("metadata", (columns) => {
          clearInterval(keepAlive);

          const schema = {
            type: "array",
            items: {
              type: "object",
              properties: columns.reduce((schema, {dbType, name}, idx) => {
                columnNameMap.set(idx, name);
                return {
                  ...schema,
                  ...{[name]: dataTypeSchema({type: dbType})},
                };
              }, {}),
            },
          };
          res.write(`${JSON.stringify(schema)}`);
          res.write("\n");
        })
        .on("end", function () {
          this.destroy();
        })
        .on("close", resolve)
        .pipe(
          new Transform({
            objectMode: true,
            transform(chunk, encoding, cb) {
              let row = null;
              try {
                row = chunk.reduce((acc, r, idx) => {
                  const key = columnNameMap.get(idx);
                  return {...acc, [key]: r};
                }, {});
              } catch (e) {
                console.error("row has unexpected format");
                // TODO: Add error handling once server supports handling error for in flight streamed response
                // cb(new Error(e));
              }
              cb(null, row);
            },
          })
        )
        .pipe(JSONStream.stringify("", "\n", "\n"))
        .pipe(res);
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  } finally {
    clearInterval(keepAlive);
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }

  res.end();
}

/*
 * This function is checking for the permission of the given credentials. It alerts the user setting
 * them up that these may be too permissive.
 * */
export async function check(req, res, pool) {
  let connection;
  try {
    const db = await pool;
    connection = await db.getConnection();

    // see: https://docs.oracle.com/en/database/oracle/oracle-database/12.2/refrn/SESSION_PRIVS.html
    const {rows} = await connection.execute(`SELECT * FROM session_privs`);

    const permissive = rows
      .map(([permission]) => permission)
      .filter((g) => !READ_ONLY.has(g));

    if (permissive.length)
      throw failedCheck(
        `User has too permissive grants: ${permissive.join(", ")}`
      );

    return {ok: true};
  } catch (e) {
    throw e;
  } finally {
    if (connection) {
      try {
        await connection.close(); // Put the connection back in the pool
      } catch (err) {
        console.error(err.message);
      }
    }
  }
}

export default (credentials) => async (req, res) => {
  const pool = pools.get(JSON.stringify(credentials), credentials, "oracle");

  if (req.method === "POST") {
    if (req.url === "/check") {
      return check(req, res, pool);
    }

    if (["/query-stream"].includes(req.url)) {
      return queryStream(req, res, pool);
    }

    throw notImplemented();
  }
};

// See https://oracle.github.io/node-oracledb/doc/api.html#-312-oracle-database-type-constants
const boolean = ["null", "boolean"],
  number = ["null", "number"],
  string = ["null", "string"];
export function dataTypeSchema({type}) {
  switch (type) {
    case oracledb.DB_TYPE_BOOLEAN:
      return {type: boolean};
    case oracledb.DB_TYPE_NUMBER:
    case oracledb.DB_TYPE_BINARY_DOUBLE:
    case oracledb.DB_TYPE_BINARY_FLOAT:
    case oracledb.DB_TYPE_BINARY_INTEGER:
      return {type: number};
    case oracledb.DB_TYPE_TIMESTAMP:
    case oracledb.DB_TYPE_DATE:
    case oracledb.DB_TYPE_TIMESTAMP_TZ:
    case oracledb.DB_TYPE_TIMESTAMP_LTZ:
    case oracledb.DB_TYPE_INTERVAL_DS:
    case oracledb.DB_TYPE_INTERVAL_YM:
      return {type: string, date: true};
    case oracledb.DB_TYPE_CHAR:
    case oracledb.DB_TYPE_BFILE:
    case oracledb.DB_TYPE_BLOB:
    case oracledb.DB_TYPE_CLOB:
    case oracledb.DB_TYPE_NCLOB:
    case oracledb.DB_TYPE_CURSOR:
    case oracledb.DB_TYPE_LONG_RAW:
    case oracledb.DB_TYPE_NCHAR:
    case oracledb.DB_TYPE_NVARCHAR:
    case oracledb.DB_TYPE_OBJECT:
    case oracledb.DB_TYPE_RAW:
    case oracledb.DB_TYPE_ROWID:
    case oracledb.DB_TYPE_VARCHAR:
    default:
      return {type: string};
  }
}
