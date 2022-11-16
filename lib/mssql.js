import Ajv from "ajv";
import JSONStream from "JSONStream";
import {json} from "micro";
import mssql from "mssql";
import {Transform} from "stream";

import {failedCheck, badRequest, notImplemented} from "./errors.js";
import pools from "./pools.js";

const TYPES = mssql.TYPES;

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
  const body = await json(req);

  if (!validate(body)) throw badRequest();

  res.setHeader("Content-Type", "text/plain");
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  let {sql, params = []} = body;

  try {
    await new Promise((resolve, reject) => {
      const request = new mssql.Request(db);
      // We are using the arrayRowMode to handle potential duplicated column name.
      // See: https://github.com/tediousjs/node-mssql#handling-duplicate-column-names
      request.arrayRowMode = true;
      const stream = request.toReadableStream();

      params.forEach((param, idx) => {
        request.input(`${idx + 1}`, param);
      });

      const columnNameMap = new Map();
      request.query(sql);
      request.once("recordset", () => clearInterval(keepAlive));
      request.on("recordset", (columns) => {
        const schema = {
          type: "array",
          items: {
            type: "object",
            properties: columns.reduce((schema, col, idx) => {
              columnNameMap.set(idx, col.name);
              return {
                ...schema,
                ...{[col.name]: dataTypeSchema({type: col.type.name})},
              };
            }, {}),
          },
        };

        res.write(`${JSON.stringify(schema)}`);
        res.write("\n");
      });

      stream
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

      stream.on("done", () => {
        resolve();
      });
      stream.on("error", (error) => {
        if (!request.canceled) {
          request.cancel();
        }
        reject(error);
      });
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  } finally {
    clearInterval(keepAlive);
  }

  res.end();
}

/*
 * This function is checking for the permission of the given credentials. It alerts the user setting
 * them up that these may be too permissive.
 * */
export async function check(req, res, pool) {
  const db = await pool;

  // See: https://learn.microsoft.com/en-us/sql/relational-databases/system-functions/sys-fn-my-permissions-transact-sql
  const rows = await db.request().query(
    `USE ${db.config.database};
     SELECT * FROM fn_my_permissions (NULL, 'DATABASE');`
  );

  const grants = rows.recordset.map((rs) => rs.permission_name);
  const permissive = grants.filter((g) => !READ_ONLY.has(g));

  if (permissive.length)
    throw failedCheck(
      `User has too permissive grants: ${permissive.join(", ")}`
    );

  return {ok: true};
}

export function addToPools(config, pools) {
  const pool = new mssql.ConnectionPool(config);
  const close = pool.close.bind(pool);

  pool.close = (...args) => {
    pools.delete(JSON.stringify(config));
    return close(...args);
  };

  pools.set(JSON.stringify(config), pool.connect());
}

export default (credentials) => async (req, res) => {
  const pool = pools.get(credentials, addToPools);

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

// See https://github.com/tediousjs/node-mssql/blob/66587d97c9ce21bffba8ca360c72a540f2bc47a6/lib/datatypes.js#L6
const boolean = ["null", "boolean"],
  integer = ["null", "integer"],
  number = ["null", "number"],
  object = ["null", "object"],
  string = ["null", "string"];
export function dataTypeSchema({type}) {
  switch (type) {
    case TYPES.Bit.name:
      return {type: boolean};
    case TYPES.TinyInt.name:
      return {type: integer, tiny: true};
    case TYPES.SmallInt.name:
      return {type: integer, short: true};
    case TYPES.BigInt.name:
      return {type: integer, long: true};
    case TYPES.Int.name:
      return {type: integer};
    case TYPES.Float.name:
      return {type: number, float: true};
    case TYPES.Numeric.name:
      return {type: number};
    case TYPES.Decimal.name:
      return {type: number, decimal: true};
    case TYPES.Real.name:
      return {type: number};
    case TYPES.Date.name:
    case TYPES.DateTime.name:
    case TYPES.DateTime2.name:
    case TYPES.DateTimeOffset.name:
    case TYPES.SmallDateTime.name:
    case TYPES.Time.name:
      return {type: string, date: true};
    case TYPES.Binary.name:
    case TYPES.VarBinary.name:
    case TYPES.Image.name:
      return {type: object, buffer: true};
    case TYPES.SmallMoney.name: // TODO
    case TYPES.Money.name: //TODO
    case TYPES.Xml.name: //TODO
    case TYPES.TVP.name: //TODO
    case TYPES.UDT.name: //TODO
    case TYPES.Geography.name: //TODO
    case TYPES.Geometry.name: //TODO
    case TYPES.Variant.name: //TODO
    default:
      return {type: string};
  }
}
