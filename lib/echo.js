import {json} from "micro";
import {parse} from "url";

export default url => {
  url = parse(url, true);

  return async function query(req, res) {
    const {sql, params} = await json(req);
    const data = [{sql, params, url}];

    // See https://ajv.js.org for details on this structure. It's used to
    // auto-parse results in your notebook to JavaScript data types. We've added
    // a few [custom keywords](https://ajv.js.org/custom.html) to handle a few
    // more types. They are:
    //
    // - {type: "string", date: true}    // Date
    // - {type: "object", buffer: true}  // ArrayBuffer
    // - {type: "string", bigint: true}  // For now, preserve as string (pending more BigInt support)
    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          sql: {type: ["string"]},
          params: {type: ["object"]},
          url: {type: ["object"]}
        }
      }
    };

    return {data, schema};
  };
};
