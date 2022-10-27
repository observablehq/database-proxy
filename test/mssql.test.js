import {expect} from "chai";
import MockReq from "mock-req";
import MockRes from "mock-res";

import {MSSQL_CREDENTIALS, MSSQL_CREDENTIALS_READ_ONLY} from "../.env.test.js";
import mssql, {sanitizeForCellTag} from "../lib/mssql.js";

const credentials = MSSQL_CREDENTIALS;
const readOnlyCredentials = MSSQL_CREDENTIALS_READ_ONLY;

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
      return new Promise(async (resolve, reject) => {
        const req = new MockReq({method: "POST", url: "/query-stream"}).end({
          sql: "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer",
          params: [],
        });

        const res = new MockRes(onEnd);

        const index = mssql(credentials);
        await index(req, res);

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
      return new Promise(async (resolve, reject) => {
        const testCustomerId = 3;
        const req = new MockReq({method: "POST", url: "/query-stream"}).end({
          sql: "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=@1",
          params: [testCustomerId],
        });

        const res = new MockRes(onEnd);

        const index = mssql(credentials);
        await index(req, res);

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
      return new Promise(async (resolve, reject) => {
        const testCustomerId = 5;
        const req = new MockReq({method: "POST", url: "/query-stream"}).end({
          sql: "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=?",
          params: [testCustomerId],
        });

        const res = new MockRes(onEnd);

        const index = mssql(credentials);
        await index(req, res);

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
  });

  describe("when sanitizing sql from cell reference", () => {
    it("should replace one ? with corresponding @TAG", () => {
      const sql =
        "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=?";
      const sanitized = sanitizeForCellTag(sql);

      expect(sanitized).to.equal(
        "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=@1"
      );
    });
    it("should replace multiple ? with corresponding @TAG", () => {
      const sql =
        "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=? AND salesID=?";
      const sanitized = sanitizeForCellTag(sql);

      expect(sanitized).to.equal(
        "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer WHERE CustomerID=@1 AND salesID=@2"
      );
    });
  });
});
