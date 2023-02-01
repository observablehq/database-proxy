import {json} from "micro";
import {URL} from "url";
import JSONStream from "JSONStream";
import snowflake from "snowflake-sdk";
import {Transform} from "stream";

import Pools from "./pools.js";
import {validateQueryPayload} from "./validate.js";
import {badRequest, failedCheck} from "./errors.js";

export const pools = new Pools(
  ({host, user, password, database, schema, warehouse, role}) =>
    Object.defineProperty(
      snowflake.createConnection({
        account: host,
        username: user,
        password,
        database,
        schema,
        warehouse,
        role,
      }),
      "end",
      {
        value() {
          this.destroy();
        },
      }
    )
);

export default (url) => async (req, res) => {
  if (req.method === "POST") {
    url = new URL(url);

    const {host, username, password, pathname, searchParams} = new URL(url);

    const connection = snowflake.createConnection({
      account: host,
      username,
      password,
      database: pathname.slice(1),
      schema: searchParams.get("schema"),
      warehouse: searchParams.get("warehouse"),
      role: searchParams.get("role"),
    });

    const connecting = new WeakSet();

    const client = await new Promise((resolve, reject) => {
      if (connection.isUp() || connecting.has(connection))
        return resolve(connection);
      snowflake.configure({ocspFailOpen: false});
      connection.connect((err, conn) => {
        if (err) reject(err);
        else resolve(conn);
      });
      connecting.add(connection);
    });

    if (req.url === "/query") return query(req, res, client);
    if (req.url === "/query-stream") return queryStream(req, res, client);
    if (req.url === "/check") return check(req, res, client);
  }
};

export async function query(req, res, client) {
  const body = await json(req);
  if (!validateQueryPayload(body)) throw badRequest();
  const {sql, params} = body;
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  const statement = client.execute({sqlText: sql, binds: params});
  try {
    let rowCount = 0;
    let bytes = 0;

    const stream = statement.streamRows();
    await new Promise((resolve, reject) => {
      let dateColumns = [];
      stream
        .on("end", resolve)
        .on("error", reject)
        .once("readable", () => clearInterval(keepAlive))
        .once("readable", () => {
          res.write(`{"schema":${JSON.stringify(schema(statement))}`);
          dateColumns = statement
            .getColumns()
            .filter((c) => dataTypeSchema(c).date)
            .map((c) => c.getName());
        })
        .pipe(
          new Transform({
            objectMode: true,
            transform(chunk, encoding, cb) {
              for (const c of dateColumns)
                if (chunk[c] !== null) chunk[c] = new Date(chunk[c]);
              cb(null, chunk);
            },
          })
        )
        .pipe(JSONStream.stringify(`,"data":[`, ",", "]}"))
        .on("data", (chunk) => {
          bytes += chunk.length;
          rowCount++;
          if (rowCount % 2e3 === 0) {
            req.log({
              progress: {
                rows: rowCount,
                fields: statement.getColumns().length,
                bytes,
                done: false,
              },
            });
          }
        })
        .pipe(res);
    });
    req.log({
      progress: {
        rows: rowCount,
        fields: statement.getColumns().length,
        bytes,
        done: true,
      },
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  } finally {
    clearInterval(keepAlive);
  }
}

export async function queryStream(req, res, client) {
  const body = await json(req);
  if (!validateQueryPayload(body)) throw badRequest();
  const {sql, params} = body;
  res.setHeader("Content-Type", "text/plain");
  const keepAlive = setInterval(() => res.write("\n"), 25e3);

  const statement = client.execute({sqlText: sql, binds: params});
  try {
    let rowCount = 0;
    let bytes = 0;

    const stream = statement.streamRows();
    await new Promise((resolve, reject) => {
      let dateColumns = [];
      stream
        .on("end", resolve)
        .on("error", reject)
        .once("readable", () => clearInterval(keepAlive))
        .once("readable", () => {
          res.write(JSON.stringify(schema(statement)));
          res.write("\n");
          dateColumns = statement
            .getColumns()
            .filter((c) => dataTypeSchema(c).date)
            .map((c) => c.getName());
        })
        .pipe(
          new Transform({
            objectMode: true,
            transform(chunk, encoding, cb) {
              for (const c of dateColumns)
                if (chunk[c] !== null) chunk[c] = new Date(chunk[c]);
              cb(null, chunk);
            },
          })
        )
        .pipe(JSONStream.stringify("", "\n", "\n"))
        .on("data", (chunk) => {
          bytes += chunk.length;
          rowCount++;
          if (rowCount % 2e3 === 0) {
            req.log({
              progress: {
                rows: rowCount,
                fields: statement.getColumns().length,
                bytes,
                done: false,
              },
            });
          }
        })
        .pipe(res);
    });
    req.log({
      progress: {
        rows: rowCount,
        fields: statement.getColumns().length,
        bytes,
        done: true,
      },
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  } finally {
    clearInterval(keepAlive);
  }
}

const READ_ONLY = new Set(["SELECT", "USAGE", "REFERENCE_USAGE"]);
export async function check(req, res, client) {
  const [{ROLE: role}] = await new Promise((resolve, reject) => {
    client.execute({
      sqlText: `SELECT CURRENT_ROLE() AS ROLE`,
      complete(err, _, rows) {
        err ? reject(err) : resolve(rows);
      },
    });
  });
  const rows = await new Promise((resolve, reject) => {
    client.execute({
      sqlText: `SHOW GRANTS TO ROLE ${role}`,
      complete(err, _, rows) {
        err ? reject(err) : resolve(rows);
      },
    });
  });

  const privileges = rows.map((r) => r.privilege);
  const permissive = new Set(privileges.filter((p) => !READ_ONLY.has(p)));
  if (permissive.size)
    throw failedCheck(
      `User has too permissive privileges: ${[...permissive].join(", ")}`
    );

  return {ok: true};
}

function schema(statement) {
  return {
    type: "array",
    items: {
      type: "object",
      properties: statement
        .getColumns()
        .reduce(
          (schema, column) => (
            (schema[column.getName()] = dataTypeSchema(column)), schema
          ),
          {}
        ),
    },
  };
}

// https://github.com/snowflakedb/snowflake-connector-nodejs/blob/master/lib/connection/result/data_types.js
const array = ["null", "array"],
  boolean = ["null", "boolean"],
  integer = ["null", "integer"],
  number = ["null", "number"],
  object = ["null", "object"],
  string = ["null", "string"];
function dataTypeSchema(column) {
  switch (column.getType()) {
    case "binary":
      return {type: object, buffer: true};
    case "boolean":
      return {type: boolean};
    case "fixed":
    case "real":
      return {type: column.getScale() ? number : integer};
    case "date":
    case "timestamp_ltz":
    case "timestamp_ntz":
    case "timestamp_tz":
      return {type: string, date: true};
    case "variant":
    case "object":
      return {type: object};
    case "array":
      return {type: array, items: {type: object}};
    case "time":
    case "text":
    default:
      return {type: string};
  }
}
