import assert from "node:assert";
import MockReq from "mock-req";
import MockRes from "mock-res";

import {MSSQL_CREDENTIALS} from "../.env.test.js";
import mssql, {dataTypeSchema} from "../lib/mssql.js";

const credentials = MSSQL_CREDENTIALS;
describe("SQL Server", () => {
  describe("when checking", () => {
    it("should throw a too permissive error", async () => {
      const req = new MockReq({
        method: "POST",
        url: "/check",
      });
      const res = new MockRes();
      const index = mssql(credentials);

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

  describe("when streaming", () => {
    it("should stream the results of simple query", (done) => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer",
        params: [],
      });

      const res = new MockRes(onEnd);

      const index = mssql(credentials);
      index(req, res);

      function onEnd() {
        const [schema, row] = this._getString().split("\n");

        assert.equal(
          schema,
          JSON.stringify({
            type: "array",
            items: {
              type: "object",
              properties: {CustomerID: {type: ["null", "integer"]}},
            },
          })
        );
        assert.equal(row, JSON.stringify({CustomerID: 12}));
        done();
      }
    });

    it("should handle parameter graciously", (done) => {
      const testCustomerId = 3;
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql:
          "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=@1",
        params: [testCustomerId],
      });

      const res = new MockRes(onEnd);

      const index = mssql(credentials);
      index(req, res);

      function onEnd() {
        const [schema, row] = this._getString().split("\n");

        assert.equal(
          schema,
          JSON.stringify({
            type: "array",
            items: {
              type: "object",
              properties: {CustomerID: {type: ["null", "integer"]}},
            },
          })
        );
        assert.equal(row, JSON.stringify({CustomerID: testCustomerId}));

        done();
      }
    });

    it("should replace cell reference in the SQL query", (done) => {
      const testCustomerId = 5;
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql:
          "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=@1",
        params: [testCustomerId],
      });

      const res = new MockRes(onEnd);

      const index = mssql(credentials);
      index(req, res);

      function onEnd() {
        const [schema, row] = this._getString().split("\n");

        assert.equal(
          schema,
          JSON.stringify({
            type: "array",
            items: {
              type: "object",
              properties: {CustomerID: {type: ["null", "integer"]}},
            },
          })
        );
        assert.equal(row, JSON.stringify({CustomerID: testCustomerId}));

        done();
      }
    });

    it("should handle duplicated column names", (done) => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "SELECT 1 as _a1, 2 as _a1 FROM test.SalesLT.SalesOrderDetail",
        params: [],
      });

      const res = new MockRes(onEnd);

      const index = mssql(credentials);
      index(req, res);

      function onEnd() {
        const [, row] = this._getString().split("\n");

        assert.equal(
          row,
          JSON.stringify({
            _a1: 2,
          })
        );

        done();
      }
    });

    it("should select the last value of any detected duplicated columns", (done) => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql:
          "SELECT TOP 1 ModifiedDate, ModifiedDate FROM test.SalesLT.SalesOrderDetail",
        params: [],
      });

      const res = new MockRes(onEnd);

      const index = mssql(credentials);
      index(req, res);

      function onEnd() {
        const [schema, row] = this._getString().split("\n");

        assert.equal(
          schema,
          JSON.stringify({
            type: "array",
            items: {
              type: "object",
              properties: {
                ModifiedDate: {type: ["null", "string"], date: true},
              },
            },
          })
        );
        assert.equal(
          row,
          JSON.stringify({
            ModifiedDate: "2008-06-01T00:00:00.000Z",
          })
        );

        done();
      }
    });
  });

  describe("when check the dataTypeSchema", () => {
    it("should TYPES.Image.name to object", () => {
      const {type} = dataTypeSchema({type: "Image"});
      assert.equal(type[0], "null");
      assert.equal(type[1], "object");
    });
  });
});
