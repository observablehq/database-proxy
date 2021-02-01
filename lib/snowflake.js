import {json} from "micro";
import {URL} from "url";
import JSONStream from "JSONStream";
import snowflake from "snowflake-sdk";

export default url => {
  url = new URL(url);
  const {host, username, password, pathname, searchParams} = new URL(
    url
  );
  const connection = snowflake.createConnection({
    account: host,
    username,
    password,
    database: pathname.slice(1),
    schema: searchParams.get("schema"),
    warehouse: searchParams.get("warehouse"),
    role: searchParams.get("role")
  });

  const connecting = new WeakSet();
  return async function query(req, res) {
    const body = await json(req);
    const {sql, params} = body;

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

    const statement = client.execute({sqlText: sql, binds: params});
    try {
      const stream = statement.streamRows();

      await new Promise((resolve, reject) => {
        stream
          .once("end", resolve)
          .on("error", reject)
          .pipe(JSONStream.stringify(`{"data":[`, ",", "]"))
          .pipe(res, {end: false});
      });
    } catch (error) {
      if (!error.statusCode) error.statusCode = 400;
      throw error;
    }

    const schema = {
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
          )
      }
    };
    res.end(`,"schema":${JSON.stringify(schema)}}`);
  };
};

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
