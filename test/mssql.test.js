import {expect} from "chai";
import MockReq from "mock-req";
import MockRes from "mock-res";

import {MSSQL_CREDENTIALS, MSSQL_CREDENTIALS_READ_ONLY} from "../.env.test.mjs";
import mssql from "../lib/mssql";

const credentials = MSSQL_CREDENTIALS;
const readOnlyCredentials = MSSQL_CREDENTIALS_READ_ONLY;

describe("mssql", () => {
  describe("when checking", () => {
    describe("with system admin user", () => {
      it.skip("should throw a too permissive error", async () => {
        const req = new MockReq({
          method: "POST",
          url: "/check",
        });
        const res = new MockRes();
        const index = mssql(credentials);
        // Not clear how we would catch this error. Skipping.
        expect(async function () {
          await index(req, res);
        }).to.throw();

        expect(1).to.equal(1);
      });
    });
    describe("with a simple read permission user", () => {
      it.skip("should be ok", async () => {
        const req = new MockReq({
          method: "POST",
          url: "/check",
        });
        const res = new MockRes();
        const index = mssql(readOnlyCredentials);
        await index(req, res);
        // Not clear what are the verbs we should include as the READ_ONLY. Skipping.
        const {ok} = res._getJSON();

        expect(ok).to.equal(true);
      });
    });
  });

  describe("when querying", () => {
    it("should run a simple query", async () => {
      const req = new MockReq({method: "POST", url: "/query-stream"}).end({
        sql: "SELECT TOP 2 CustomerID FROM test.SalesLT.Customer",
        params: [],
      });

      const res = new MockRes();

      const index = mssql(credentials);
      await index(req, res);

      const [schema, row] = res._getString().split("\n");

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
    });
  });
});
