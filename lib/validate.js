import Ajv from "ajv";

const ajv = new Ajv();

export const validateQueryPayload = ajv.compile({
  type: "object",
  additionalProperties: false,
  required: ["sql"],
  properties: {
    sql: {type: "string", minLength: 1},
    params: {type: ["object", "array"]},
  },
});
