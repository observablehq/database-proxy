import assert from "node:assert";
import MockReq from "mock-req";
import MockRes from "mock-res";
import snowflake, {pools} from "../lib/snowflake.js";
import logger from "../middleware/logger.js";

import {SNOWFLAKE_TEST_CREDENTIALS} from "../.env.test.js";
const index = logger(snowflake(SNOWFLAKE_TEST_CREDENTIALS));

describe("Snowflake", function () {
  this.timeout(50000);
  after(() => pools.end());

  describe("when checking", () => {
    it("should handle Snowflake credential check", async () => {
      const req = new MockReq({method: "POST", url: "/check"});
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.match(error.message, /^User has too permissive privileges: /);
      }
    });
  });

  describe("when querying", () => {
    it("should handle Snowflake requests", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `
      with foo as (
        select 1 as c1 union all select 2 as c1
      )
      select c1
      from foo
      where c1 = ?`,
        params: [1],
      });
      const res = new MockRes();

      await index(req, res);

      const {data, schema} = res._getJSON();
      assert.deepEqual(data, [{C1: 1}]);
      assert.deepEqual(schema, {
        type: "array",
        items: {type: "object", properties: {C1: {type: ["null", "integer"]}}},
      });
    });

    it("should handle Snowflake errors", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: "SELECT * FROM gibberish",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(
          error.message,
          "SQL compilation error:\nObject 'GIBBERISH' does not exist or not authorized."
        );
      }
    });

    it("should handle Snowflake empty query", async () => {
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

    it("should handle Snowflake empty results", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `SELECT 1 AS c1 LIMIT 0`,
      });
      const res = new MockRes();

      await index(req, res);

      const {data, schema} = res._getJSON();
      assert.deepEqual(data, []);
      assert.deepEqual(schema, {
        type: "array",
        items: {type: "object", properties: {C1: {type: ["null", "integer"]}}},
      });
    });
  });

  describe("when streaming", () => {
    it("should handle Snowflake stream requests", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: `
      with foo as (
        select 1 as c1 union all select 2 as c1
      )
      select c1
      from foo
      where c1 = ?`,
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
            properties: {C1: {type: ["null", "integer"]}},
          },
        }) +
          "\n" +
          JSON.stringify({C1: 1}) +
          "\n"
      );
    });

    it("should handle Snowflake stream errors", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "SELECT * FROM users",
      });
      const res = new MockRes();

      try {
        await index(req, res);
      } catch (error) {
        assert.equal(error.statusCode, 400);
        assert.equal(
          error.message,
          "SQL compilation error:\nObject 'USERS' does not exist or not authorized."
        );
      }
    });

    it("should handle Snowflake stream empty query", async () => {
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

    it("should handle Snowflake stream empty results", async () => {
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
            properties: {C1: {type: ["null", "integer"]}},
          },
        }) + "\n\n"
      );
    });
  });

  describe("when inferring the dataTypeSchema", () => {
    it("should handle Snowflake simple types", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `select
      1 as c1,
      3.14 as c2,
      to_binary('DEADBEEF') as c3,
      'hello' as c4,
      TIMESTAMP '2019-01-01' as c5,
      true as c6,
      to_object(parse_json('{"a": 1}')) as c7
    `,
      });
      const res = new MockRes();

      await index(req, res);
      const {data, schema} = res._getJSON();
      assert.deepEqual(data, [
        {
          C1: 1,
          C2: 3.14,
          C3: {type: "Buffer", data: [222, 173, 190, 239]},
          C4: "hello",
          C5: "2019-01-01T00:00:00.000Z",
          C6: true,
          C7: {a: 1},
        },
      ]);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {
            C1: {type: ["null", "integer"]},
            C2: {type: ["null", "number"]},
            C3: {type: ["null", "object"], buffer: true},
            C4: {type: ["null", "string"]},
            C5: {type: ["null", "string"], date: true},
            C6: {type: ["null", "boolean"]},
            C7: {type: ["null", "object"]},
          },
        },
      });
    });

    it("should handle Snowflake date, time, time zones", async () => {
      const req = new MockReq({method: "POST", url: "/query"}).end({
        sql: `select
      TO_DATE('2020-01-01') as date,
      TO_TIMESTAMP_NTZ('2020-01-01 01:23:45') as datetime, -- timestamp_ntz
      TO_TIME('01:23:45') as time,
      TO_TIMESTAMP('2020-01-01 01:23:45') as timestamp, -- timestamp_ntz
      TO_TIMESTAMP_LTZ('2020-01-01 01:23:45') as timestamp_ltz,
      TO_TIMESTAMP_NTZ('2020-01-01 01:23:45') as timestamp_ntz,
      TO_TIMESTAMP_TZ('2020-01-01 01:23:45') as timestamp_tz,
      TO_DATE(null) as null_date
    `,
      });
      const res = new MockRes();

      await index(req, res);
      const {data, schema} = res._getJSON();

      assert.deepEqual(data, [
        {
          DATE: "2020-01-01T00:00:00.000Z",
          DATETIME: "2020-01-01T01:23:45.000Z",
          TIME: "01:23:45",
          TIMESTAMP: "2020-01-01T01:23:45.000Z",
          TIMESTAMP_LTZ: "2020-01-01T09:23:45.000Z",
          TIMESTAMP_NTZ: "2020-01-01T01:23:45.000Z",
          TIMESTAMP_TZ: "2020-01-01T09:23:45.000Z",
          NULL_DATE: null,
        },
      ]);
      assert.deepEqual(schema, {
        type: "array",
        items: {
          type: "object",
          properties: {
            DATE: {type: ["null", "string"], date: true},
            DATETIME: {type: ["null", "string"], date: true},
            TIME: {type: ["null", "string"]},
            TIMESTAMP: {type: ["null", "string"], date: true},
            TIMESTAMP_LTZ: {type: ["null", "string"], date: true},
            TIMESTAMP_NTZ: {type: ["null", "string"], date: true},
            TIMESTAMP_TZ: {type: ["null", "string"], date: true},
            NULL_DATE: {type: ["null", "string"], date: true},
          },
        },
      });
    });
  });

  describe("when connecting to Snowflake", () => {
    it("shouldn't attempt concurrent connections", async () => {
      // Ensure a cold connection state
      pools.del(SNOWFLAKE_TEST_CREDENTIALS);

      const req1 = new MockReq({method: "POST", url: "/query"}).end({
        sql: "select 1",
      });
      const res1 = new MockRes();
      const req2 = new MockReq({method: "POST", url: "/query"}).end({
        sql: "select 2",
      });
      const res2 = new MockRes();

      await Promise.all([index(req1, res1), index(req2, res2)]);

      const {data: data1, schema: schema1} = res1._getJSON();
      assert.deepEqual(data1, [{1: 1}]);
      assert.deepEqual(schema1, {
        type: "array",
        items: {
          type: "object",
          properties: {
            1: {type: ["null", "integer"]},
          },
        },
      });

      const {data: data2, schema: schema2} = res2._getJSON();
      assert.deepEqual(data2, [{2: 2}]);
      assert.deepEqual(schema2, {
        type: "array",
        items: {
          type: "object",
          properties: {
            2: {type: ["null", "integer"]},
          },
        },
      });
    });

    it("should recreates connection on connect error (slow)", async () => {
      const badCredentials = snowflake("snowflake://hi@hi/hi");
      const req = new MockReq({method: "POST", url: "/check"});
      const res = new MockRes();

      try {
        await badCredentials(req, res);
      } catch (error) {
        assert.equal(
          error.message,
          "Request to Snowflake failed.",
          "First failure"
        );
      }
      try {
        await badCredentials(req, res);
      } catch (error) {
        assert.equal(
          error.message,
          "Request to Snowflake failed.",
          "Second failure is identical"
        );
      }
    });
  });
});
