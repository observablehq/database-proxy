import {expect} from "chai";
import MockReq from "mock-req";
import MockRes from "mock-res";

import oracle from "../lib/oracle.js";
import {ORACLE_CREDENTIALS} from "../.env.test.js";

const credentials = JSON.parse(ORACLE_CREDENTIALS);

describe("oracle", () => {
  describe("when checking", () => {
    describe("with system admin user", () => {
      it("should throw a too permissive error", () => {
        const req = new MockReq({
          method: "POST",
          url: "/check",
        });
        const res = new MockRes();
        const index = oracle(credentials);

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
          sql: "SELECT 1 AS A_1 FROM nodetab",
          params: [],
        });

        const res = new MockRes(onEnd);

        const index = oracle(credentials);
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
  });
});
