import JSONStream from "JSONStream";
import {json} from "micro";
import mssql from "mssql";
import {notFound, failedCheck} from "./errors.js";

const pools = new Map();

// TODO: Confirm these are the right SQL verbs.
const READ_ONLY = new Set(["SELECT", "SHOW DATABASES", "SHOW VIEW", "USAGE"]);

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

  // TODO: validate payload. What is the contract ?
  // if (!validate(body)) throw badRequest();

  res.setHeader("Content-Type", "text/plain");

  // Use streaming, see: https://github.com/tediousjs/node-mssql#streaming
  const {sql, params} = body;

  try {
    await new Promise((resolve, reject) => {
      const stream = new mssql.Request(db);
      stream.stream = true;
      stream.query(sql);

      stream.on("recordset", (columns) => {
        const schema = {
          type: "array",
          items: {
            type: "object",
            properties: Object.entries(columns).reduce(
              (schema, [name, props]) => {
                return {...schema, ...{[name]: props.type.name}};
              },
              {}
            ),
          },
        };
        res.write(`"schema":${JSON.stringify(schema)}}`);
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

      stream.pipe(JSONStream.stringify(`,"data":[`, ",", "]}")).pipe(res);
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
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
