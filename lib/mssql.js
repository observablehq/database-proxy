import {json} from "micro";

async function query(req, res) {
  const {sql, params} = await json(req);

  let fields = [];

  await new Promise((resolve, reject) => {
    resolve();
  });

  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: fields.reduce((schema) => schema, {}),
    },
  };

  res.end(`,"schema":${JSON.stringify(schema)}}`);
}

export default (url) => {
  console.log("MSSQL_CLOSURE", url);
  return query;
};
