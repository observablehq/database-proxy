import {json} from "micro";
import JSONStream from "JSONStream";
import {Transform} from "stream";

import {badRequest, failedCheck} from "./errors.js";
import {validateQueryPayload} from "./validate.js";
import Pools from "./pools.js";

const READ_ONLY = new Set(["SELECT", "USAGE", "CONNECT"]);
export class OracleSingleton {
  static instance = null;
  static types = new Map();
  constructor() {
    throw new Error(
      "Do not use new OracleSingleton(). Call OracleSingleton.initialize() instead."
    );
  }
  static initialize() {
    const boolean = ["null", "boolean"],
      number = ["null", "number"],
      object = ["null", "object"],
      string = ["null", "string"];

    if (!OracleSingleton.instance) {
      try {
        OracleSingleton.instance = import("oracledb").then((module) => {
          const oracledb = module.default;
          oracledb.initOracleClient({
            libDir: process.env.LIB_DIR_PATH,
          });

          OracleSingleton.types
            .set(oracledb.DB_TYPE_BOOLEAN, {
              type: boolean,
            })
            .set(oracledb.DB_TYPE_NUMBER, {type: number})
            .set(oracledb.DB_TYPE_BINARY_FLOAT, {
              type: number,
            })
            .set(oracledb.DB_TYPE_BINARY_DOUBLE, {
              type: number,
            })
            .set(oracledb.DB_TYPE_BINARY_INTEGER, {
              type: number,
            })
            .set(oracledb.DB_TYPE_TIMESTAMP, {
              type: string,
              date: true,
            })
            .set(oracledb.DB_TYPE_DATE, {
              type: string,
              date: true,
            })
            .set(oracledb.DB_TYPE_TIMESTAMP_TZ, {
              type: string,
              date: true,
            })
            .set(oracledb.DB_TYPE_TIMESTAMP_LTZ, {
              type: string,
              date: true,
            })
            .set(oracledb.DB_TYPE_INTERVAL_DS, {
              type: string,
              date: true,
            })
            .set(oracledb.DB_TYPE_INTERVAL_YM, {
              type: string,
              date: true,
            })
            .set(oracledb.DB_TYPE_BLOB, {
              type: object,
              buffer: true,
            });

          return oracledb;
        });
      } catch (err) {
        console.error(err);
      }
    }
  }
  static getInstance() {
    if (!OracleSingleton.instance)
      throw new Error(
        "OracleSingleton not initialized. Call OracleSingleton.initialize() first."
      );
    return OracleSingleton.instance;
  }

  get types() {
    if (OracleSingleton.types.size === 0)
      throw new Error(
        "OracleSingleton not initialized. Call OracleSingleton.initialize() first."
      );
    return OracleSingleton.types;
  }
}

export async function queryStream(req, res, pool) {
  const db = await pool;
  const connection = await db.getConnection();
  const body = await json(req);

  if (!validateQueryPayload(body)) throw badRequest();

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
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err.message);
      }
    }
  }
}

export const pools = new Pools(async (credentials) => {
  const oracledb = await OracleSingleton.getInstance();
  credentials.connectionString = decodeURI(credentials.connectionString);
  const pool = await oracledb.createPool(credentials);

  Object.defineProperty(pool, "end", {
    value() {
      // We must ensure there is no query still running before we close the pool.
      if (this._connectionsOut === 0) {
        this.close();
      }
    },
  });

  return pool;
});

export default async ({url, username, password}) => {
  OracleSingleton.initialize();
  // We do not want to import the oracledb library until we are sure that the user is looking to use Oracle.
  // Installing the oracledb library is a pain, so we want to avoid it if possible.
  const config = {
    username,
    password,
    connectionString: decodeURI(url),
  };

  const oracledb = await OracleSingleton.getInstance();
  const pool = oracledb.createPool(config);

  return async (req, res) => {
    return queryStream(req, res, pool);
  };
};

// See https://oracle.github.io/node-oracledb/doc/api.html#-312-oracle-database-type-constants
function dataTypeSchema({type}) {
  const types = OracleSingleton.types;
  if (types.has(type)) {
    return types.get(type);
  }

  return {type: ["null", "string"]};
}
