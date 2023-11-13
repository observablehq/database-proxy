import Ajv from "ajv";

const ajv = new Ajv({allowUnionTypes: true});

export const validateQueryPayload = ajv.compile({
  type: "object",
  additionalProperties: false,
  required: ["sql"],
  properties: {
    sql: {type: "string", minLength: 1, maxLength: 32 * 1000},
    params: {anyOf: [{type: ["object"]}, {type: ["array"]}]},
  },
});
export const validateDescribeColumnsPayload = ajv.compile({
  type: "object",
  additionalProperties: false,
  required: ["table"],
  properties: {
    catalog: {type: "string", minLength: 1, maxLength: 32 * 1000},
    schema: {type: "string", minLength: 1, maxLength: 32 * 1000},
    table: {type: "string", minLength: 1, maxLength: 32 * 1000},
  },
});
