import Ajv from "ajv";
import JSONStream from "JSONStream";
import {json} from "micro";
import mssql, {TYPES} from "mssql";
import {notFound, failedCheck, badRequest} from "./errors.js";

const pools = new Map();

// TODO: Confirm these are the right SQL verbs.
const READ_ONLY = new Set(["SELECT", "SHOW DATABASES", "SHOW VIEW", "USAGE"]);

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

// Since we want to work with more than one DB,
// we will need to use a custom version of the MSSQL pool.
// See: https://tediousjs.github.io/node-mssql/#connection-pools
export const mssqlPool = {
  get: (name, config) => {
    if (!pools.has(name)) {
      if (!config) {
        throw new Error("Pool does not exist");
      }

      const pool = new mssql.ConnectionPool(config);
      // automatically remove the pool from the cache if `pool.close()` is called
      const close = pool.close.bind(pool);
      pool.close = (...args) => {
        pools.delete(name);
        return close(...args);
      };

      pools.set(name, pool.connect());
    }

    return pools.get(name);
  },

  closeAll: () =>
    Promise.all(
      Array.from(pools.values()).map((connect) => {
        return connect.then((pool) => pool.close());
      })
    ),
};

export async function query(req, res, pool) {
  const db = await pool;
  const body = await json(req);

  if (!validate(body)) throw badRequest();

  res.setHeader("Content-Type", "text/plain");
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  const {sql, params} = body;

  try {
    await new Promise((resolve, reject) => {
      const stream = new mssql.Request(db);
      stream.stream = true;
      stream.query(sql);

      stream.once("recordset", () => clearInterval(keepAlive));

      stream.on("recordset", (columns) => {
        const schema = {
          type: "array",
          items: {
            type: "object",
            properties: Object.entries(columns).reduce(
              (schema, [name, props]) => {
                return {
                  ...schema,
                  ...{[name]: dataTypeSchema({type: props.type.name})},
                };
              },
              {}
            ),
          },
        };

        res.write(`${JSON.stringify(schema)}`);
        res.write("\n");
      });

      stream.on("done", () => {
        resolve();
      });

      stream.on("error", (error) => {
        if (!stream.canceled) {
          stream.cancel();
        }
        reject(error);
      });

      stream.pipe(JSONStream.stringify("", "\n", "\n")).pipe(res);
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  } finally {
    clearInterval(keepAlive);
  }

  res.end();
}

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

export default (credentials) => {
  const pool = mssqlPool.get(credentials, credentials);

  return async (req, res) => {
    if (req.method === "POST") {
      if (req.url === "/check") {
        return check(req, res, pool);
      }

      // Assuming we are only supporting query-stream moving forward ?
      if (["/query", "/query-stream"].includes(req.url)) {
        return query(req, res, pool);
      }

      // Legacy api defaults to query
      // Or do we change the API and return NotFound same as in data-connector ?
      // Breaking change --> New VERSION.
      // return query(req, res, pool);
      throw notFound();
    }
  };
};

// See https://github.com/tediousjs/node-mssql/blob/66587d97c9ce21bffba8ca360c72a540f2bc47a6/lib/datatypes.js#L6
const boolean = ["null", "boolean"],
  integer = ["null", "integer"],
  number = ["null", "number"],
  string = ["null", "string"];
function dataTypeSchema({type, charsetNr}) {
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
      return {type: string, date: true};
    case TYPES.Time.name: // TODO
    case TYPES.SmallMoney.name: // TODO
    case TYPES.Money.name: //TODO
    case TYPES.Binary.name: //TODO
    case TYPES.VarBinary.name: //TODO
    case TYPES.Image.name: //TODO
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
