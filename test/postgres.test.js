import assert from "node:assert";
import MockReq from "mock-req";
import MockRes from "mock-res";
import logger from "../middleware/logger.js";
import pg, {pools} from "../lib/postgres.js";

import {POSTGRES_TEST_CREDENTIALS} from "../.env.test.js";
const index = logger(pg(POSTGRES_TEST_CREDENTIALS));

describe("postgreSQL", () => {
  after(() => pools.end());

  describe("when checking", () => {
    it("should perform Postgres credential check", async () => {
      const req = new MockReq({method: "POST", url: "/check"});
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(
          error.message,
          "User has too permissive privileges: DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE"
        );
      }
    });
  });

  describe("when querying", () => {
    it("should resolve Postgres requests", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `
      with foo as (
        select 1 as c1 union all select 2 as c1
      )
      select c1
      from foo
      where c1 = $1`,
        params: [1],
      });
      const res = new MockRes();

      await index(req, res);

      const {data, schema} = res._getJSON();
      assert.deepEqual(data, [{c1: 1}]);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {c1: {type: ["null", "integer"], int32: true}},
        },
      });
    });

    it("should handle Postgres errors", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: "SELECT * FROM gibberish",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, 'relation "gibberish" does not exist');
      }
    });

    it("should handle Postgres empty query", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: "",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Bad request");
      }
    });

    it("should handle Postgres empty results", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `SELECT 1 AS c1 LIMIT 0`,
      });
      const res = new MockRes();

      await index(req, res);

      const {data, schema} = res._getJSON();
      assert.deepEqual(data, []);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {c1: {type: ["null", "integer"], int32: true}},
        },
      });
    });
  });

  describe("when streaming", () => {
    it("should handle Postgres stream requests", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: `
      with foo as (
        select 1 as c1 union all select 2 as c1
      )
      select c1
      from foo
      where c1 = $1`,
        params: [1],
      });
      const res = new MockRes();

      await index(req, res);
      const response = res._getString();

      assert.equal(
        response,
        JSON.stringify({
          type: "array",
          items: {
            type: "object",
            properties: {c1: {type: ["null", "integer"], int32: true}},
          },
        }) +
          "\n" +
          `{"c1":1}\n`
      );
    });

    it("should handle Postgres stream empty query", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Bad request");
      }
    });

    it("should handle Postgres stream errors", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "SELECT * FROM gibberish",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, 'relation "gibberish" does not exist');
      }
    });

    it("should handle Postgres stream empty query", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Bad request");
      }
    });

    it("should handle Postgres stream empty results", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "SELECT 1 AS c1 LIMIT 0",
      });
      const res = new MockRes();

      await index(req, res);
      const response = res._getString();

      assert.equal(
        response,
        JSON.stringify({
          type: "array",
          items: {
            type: "object",
            properties: {c1: {type: ["null", "integer"], int32: true}},
          },
        }) + "\n\n"
      );
    });
  });

  describe("when inferring the dataTypeSchema", () => {
    it("should handle Postgres simple types", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `select
          1 as c1,
          3.14 as c2,
          E'\\\\xDEADBEEF'::bytea as c3,
          'hello' as c4,
          DATE '2019-01-01' as c5,
          true as c6,
          '{"a": 1}'::json as c7,
          '{"b": 2}'::jsonb as c8
        `,
      });
      const res = new MockRes();

      await index(req, res);
      const {data, schema} = res._getJSON();
      assert.deepEqual(data, [
        {
          c1: 1,
          c2: "3.14",
          c3: {type: "Buffer", data: [222, 173, 190, 239]},
          c4: "hello",
          c5: "2019-01-01T00:00:00.000Z",
          c6: true,
          c7: {a: 1},
          c8: {b: 2},
        },
      ]);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {
            c1: {type: ["null", "integer"], int32: true},
            c2: {type: ["null", "string"], numeric: true},
            c3: {type: ["null", "object"], buffer: true},
            c4: {type: ["null", "string"], text: true},
            c5: {type: ["null", "string"], date: true},
            c6: {type: ["null", "boolean"]},
            c7: {type: ["null", "object"]},
            c8: {type: ["null", "object"]},
          },
        },
      });
    });

    it("should handle Postgres array types", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `select
          '{1, 2, 3}'::int[] as c1,
          '{2.18, 3.14, 6.22}'::float[] as c2,
          '{"\\\\xDEADBEEF", "\\\\xFACEFEED"}'::bytea[] as c3,
          '{"hello", "goodbye"}'::varchar[] as c4,
          '{"2019-01-01"}'::timestamp[] as c5,
          '{true, false, true}'::bool[] as c6,
          '{"{\\"a\\": 1}", "{\\"b\\": 2}"}'::json[] as c7
        `,
      });
      const res = new MockRes();

      await index(req, res);
      const {data, schema} = res._getJSON();
      assert.deepEqual(data, [
        {
          c1: [1, 2, 3],
          c2: [2.18, 3.14, 6.22],
          c3: [
            {type: "Buffer", data: [222, 173, 190, 239]},
            {type: "Buffer", data: [250, 206, 254, 237]},
          ],
          c4: ["hello", "goodbye"],
          c5: ["2019-01-01T00:00:00.000Z"],
          c6: [true, false, true],
          c7: [{a: 1}, {b: 2}],
        },
      ]);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {
            c1: {
              type: ["null", "array"],
              items: {type: ["null", "integer"], int32: true},
            },
            c2: {
              type: ["null", "array"],
              items: {type: ["null", "number"], float64: true},
            },
            c3: {
              type: ["null", "array"],
              items: {type: ["null", "object"], buffer: true},
            },
            c4: {
              type: ["null", "array"],
              items: {type: ["null", "string"], varchar: true},
            },
            c5: {
              type: ["null", "array"],
              items: {type: ["null", "string"], date: true},
            },
            c6: {type: ["null", "array"], items: {type: ["null", "boolean"]}},
            c7: {type: ["null", "array"], items: {type: ["null", "object"]}},
          },
        },
      });
    });
  });
});
