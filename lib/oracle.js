import Ajv from "ajv";
import {json} from "micro";
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
  const db = pool.getConnection();
  const body = await json(req);

  if (!validate(body)) throw badRequest();

  res.setHeader("Content-Type", "text/plain");
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  let {sql, params = []} = body;

  try {
    await new Promise((resolve, reject) => {
      resolve([]);
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
