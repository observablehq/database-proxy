import {expect} from "chai";
import MockReq from "mock-req";
import MockRes from "mock-res";

import {MSSQL_CREDENTIALS} from "../.env.test.js";
import mssql, {dataTypeSchema} from "../lib/mssql.js";

const credentials = MSSQL_CREDENTIALS;
describe("mssql", () => {
  describe("when checking", () => {
    describe("with system admin user", () => {
      it("should throw a too permissive error", () => {
        const req = new MockReq({
          method: "POST",
          url: "/check",
        });
        const res = new MockRes();
        const index = mssql(credentials);

        return index(req, res).then(
          () => Promise.reject("Expect call to throw!"),
          (err) => {
            expect(err.statusCode).to.equal(200);
            expect(
              err.message.includes("User has too permissive grants")
            ).to.equal(true);
          }
        );
      });
    });
  });

  describe("when querying", () => {
    it("should stream the results of simple query", () => {
      return new Promise((resolve) => {
        const req = new MockReq({method: "POST", url: "/query-stream"}).end({
          sql: "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer",
          params: [],
        });

        const res = new MockRes(onEnd);

        const index = mssql(credentials);
        index(req, res);

        function onEnd() {
          const [schema, row] = this._getString().split("\n");

          expect(schema).to.equal(
            JSON.stringify({
              type: "array",
              items: {
                type: "object",
                properties: {CustomerID: {type: ["null", "integer"]}},
              },
            })
          );
          expect(row).to.equal(JSON.stringify({CustomerID: 12}));

          resolve();
        }
      });
    });
    it("should handle parameter graciously", () => {
      return new Promise((resolve) => {
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

          expect(schema).to.equal(
            JSON.stringify({
              type: "array",
              items: {
                type: "object",
                properties: {CustomerID: {type: ["null", "integer"]}},
              },
            })
          );
          expect(row).to.equal(JSON.stringify({CustomerID: testCustomerId}));

          resolve();
        }
      });
    });
    it("should replace cell reference in the SQL query", () => {
      return new Promise((resolve) => {
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

          expect(schema).to.equal(
            JSON.stringify({
              type: "array",
              items: {
                type: "object",
                properties: {CustomerID: {type: ["null", "integer"]}},
              },
            })
          );
          expect(row).to.equal(JSON.stringify({CustomerID: testCustomerId}));

          resolve();
        }
      });
    });
    it("should handle duplicated column names", () => {
      return new Promise((resolve) => {
        const req = new MockReq({method: "POST", url: "/query-stream"}).end({
          sql: "SELECT 1 as _a1, 2 as _a1 FROM test.SalesLT.SalesOrderDetail",
          params: [],
        });

        const res = new MockRes(onEnd);

        const index = mssql(credentials);
        index(req, res);

        function onEnd() {
          const [, row] = this._getString().split("\n");

          expect(row).to.equal(
            JSON.stringify({
              _a1: 2,
            })
          );

          resolve();
        }
      });
    });
    it("should select the last value of any detected duplicated columns", () => {
      return new Promise((resolve) => {
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

          expect(schema).to.equal(
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
          expect(row).to.equal(
            JSON.stringify({
              ModifiedDate: "2008-06-01T00:00:00.000Z",
            })
          );

          resolve();
        }
      });
    });
  });

  describe("when check the dataTypeSchema", () => {
    it("should TYPES.Image.name to object", () => {
      const {type} = dataTypeSchema({type: "Image"});
      expect(type[0]).to.equal("null");
      expect(type[1]).to.equal("object");
    });
  });
});
