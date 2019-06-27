import { json } from "micro";
import { createPool } from "mysql";
import { parseUrl } from "mysql/lib/ConnectionConfig";
import types from "mysql/lib/protocol/constants/types";
import JSONStream from "JSONStream";

export default url => {
  const pool = createPool(parseUrl(url));

  return async function query(req, res) {
    const { sql, params } = await json(req);

    let fields;
    await new Promise((resolve, reject) => {
      const stream = pool
        .query({ sql, timeout: 30e3 }, params)
        .on("fields", f => (fields = f))
        .stream()
        .on("end", resolve)
        .on("error", error => {
          stream.destroy();
          reject(error);
        })
        .pipe(JSONStream.stringify(`{"data":[`, ",", "]"));
      stream.pipe(
        res,
        { end: false }
      );
    });

    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: fields.reduce(
          (schema, { name, type, charsetNr }) => (
            (schema[name] = dataTypeSchema({ type, charsetNr })), schema
          ),
          {}
        )
      }
    };
    res.end(`,"schema":${JSON.stringify(schema)}}`);
  };
};

// https://github.com/mysqljs/mysql/blob/5569e02ad72789f4b396d9a901f0390fe11b5b4e/lib/protocol/constants/types.js
// https://github.com/mysqljs/mysql/blob/5569e02ad72789f4b396d9a901f0390fe11b5b4e/lib/protocol/packets/RowDataPacket.js#L53
const boolean = ["null", "boolean"],
  integer = ["null", "integer"],
  number = ["null", "number"],
  object = ["null", "object"],
  string = ["null", "string"];
function dataTypeSchema({ type, charsetNr }) {
  switch (type) {
    case types.BIT:
      return { type: boolean };
    case types.TINY:
    case types.SHORT:
    case types.LONG:
      return { type: integer };
    case types.INT24:
    case types.YEAR:
    case types.FLOAT:
    case types.DOUBLE:
    case types.DECIMAL:
    case types.NEWDECIMAL:
      return { type: number };
    case types.TIMESTAMP:
    case types.DATE:
    case types.DATETIME:
    case types.NEWDATE:
    case types.TIMESTAMP2:
    case types.DATETIME2:
    case types.TIME2:
      return { type: string, date: true };
    case types.LONGLONG: // TODO
      return { type: string, bigint: true };
    case types.TINY_BLOB:
    case types.MEDIUM_BLOB:
    case types.LONG_BLOB:
    case types.BLOB:
    case types.VAR_STRING:
    case types.VARCHAR:
    case types.STRING:
      return charsetNr === 63 // binary
        ? { type: object, buffer: true }
        : { type: string };
    case types.JSON:
      return { type: object };
    case types.TIME: // TODO
    case types.ENUM: // TODO
    case types.SET: // TODO
    case types.GEOMETRY: // TODO
    case types.NULL: // TODO
    default:
      return { type: string };
  }
}
