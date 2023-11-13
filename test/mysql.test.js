import assert from "node:assert";
import MockReq from "mock-req";
import MockRes from "mock-res";
import logger from "../middleware/logger.js";
import mysql, {pools} from "../lib/mysql.js";

import {MYSQL_TEST_CREDENTIALS} from "../.env.test.js";
const index = logger(mysql(MYSQL_TEST_CREDENTIALS));

describe("MySQL", () => {
  after(() => pools.end());

  describe("when checking", () => {
    it("should do MySQL credential check", async () => {
      const req = new MockReq({method: "POST", url: "/check"});
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(
          /User has too permissive grants/.test(error.message),
          true
        );
      }
    });
  });

  describe("when querying", () => {
    it("should resolves MySQL requests", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `
      select c1
      from (select 'hello' as c1 union all select 2 as c1) as foo
      where c1 = ?`,
        params: ["hello"],
      });
      const res = new MockRes();
      await index(req, res);

      const {data, schema} = res._getJSON();

      assert.deepEqual(data, [{c1: "hello"}]);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {c1: {type: ["null", "string"]}},
        },
      });
    });

    it("should handle MySQL errors", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: "SELECT * FROM users",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Table 'mysql.users' doesn't exist");
      }
    });

    it("should handle MySQL empty query", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: "",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Query was empty");
      }
    });

    it("should handle MySQL empty results", async () => {
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
          properties: {c1: {type: ["null", "integer"], long: true}},
        },
      });
    });
  });

  describe("when streaming", () => {
    it("should handle MySQL stream requests", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: `
      select c1
      from (select 'hello' as c1 union all select 2 as c1) as foo
      where c1 = ?`,
        params: ["hello"],
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
            properties: {c1: {type: ["null", "string"]}},
          },
        }) +
          "\n" +
          JSON.stringify({c1: "hello"}) +
          "\n"
      );
    });

    it("should handle MySQL stream errors", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "SELECT * FROM users",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Table 'mysql.users' doesn't exist");
      }
    });

    it("should hande MySQL stream empty query", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(error.message, "Query was empty");
      }
    });

    it("MySQL stream empty results", async () => {
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
            properties: {c1: {type: ["null", "integer"], long: true}},
          },
        }) + "\n\n"
      );
    });
  });

  describe("when check the dataTypeSchema", () => {
    it("should provide the right MySQL types", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: "select 1 as c1, 3.14 as c2, 0xdeadbeef as c3, 'hello' as c4, DATE '2019-01-01' as c5, 1234567890 as c6",
      });
      const res = new MockRes();

      await index(req, res);
      const {data, schema} = res._getJSON();
      assert.deepEqual(data, [
        {
          c1: 1,
          c2: 3.14,
          c3: {type: "Buffer", data: [222, 173, 190, 239]},
          c4: "hello",
          c5: "2019-01-01T00:00:00.000Z",
          c6: 1234567890,
        },
      ]);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {
            c1: {type: ["null", "integer"], long: true},
            c2: {type: ["null", "number"], newdecimal: true},
            c3: {type: ["null", "object"], buffer: true},
            c4: {type: ["null", "string"]},
            c5: {type: ["null", "string"], date: true},
            c6: {type: ["null", "string"], bigint: true},
          },
        },
      });
    });

    it("should handle query not returning any fields", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "FLUSH PRIVILEGES",
      });
      const res = new MockRes();

      await index(req, res);
      const response = res._getString();
      const [schema] = response.split("\n");

      assert.deepEqual(
        schema,
        JSON.stringify({
          type: "array",
          items: {
            type: "object",
            properties: {},
          },
        })
      );
    });
  });
});
