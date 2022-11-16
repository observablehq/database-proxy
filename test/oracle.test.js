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
    it("should stream the results of a simple query", () => {
      return new Promise(async (resolve, reject) => {
        const req = new MockReq({method: "POST", url: "/query-stream"}).end({
          sql: `SELECT 1 AS A_1, 
                'A_REGULAR_STRING' AS A_2
                FROM DUAL`,
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
                properties: {
                  A_1: {
                    type: ["null", "number"],
                  },
                  A_2: {
                    type: ["null", "string"],
                  },
                },
              },
            })
          );

          expect(row).to.equal(
            JSON.stringify({A_1: 1, A_2: "A_REGULAR_STRING"})
          );

          resolve();
        }
      });
    });
    it("should stream the results of a query including dates format", () => {
      return new Promise(async (resolve, reject) => {
        const req = new MockReq({method: "POST", url: "/query-stream"}).end({
          sql: `SELECT TO_TIMESTAMP('2005-04-04 09:30:00', 'YYYY-MM-DD HH:MI:SS') AS A_SIMPLE_DATE,
                 TO_DATE('January 15, 1989, 11:00 A.M.', 'Month dd, YYYY, HH:MI A.M.','NLS_DATE_LANGUAGE = American') AS A_TEST_DATE,
                 TO_TIMESTAMP_TZ('1999-12-0111:00:00-08:00','YYYY-MM-DDHH:MI:SSTZH:TZM') AS A_TZ_TIMESTAMP,
                 TO_DATE('January 15, 1989, 11:00 A.M.', 'Month dd, YYYY, HH:MI A.M.','NLS_DATE_LANGUAGE = American') + TO_DSINTERVAL('100 10:00:00') AS A_INTERVAL,
                 TO_DATE('January 15, 1989, 11:00 A.M.', 'Month dd, YYYY, HH:MI A.M.','NLS_DATE_LANGUAGE = American') + TO_YMINTERVAL('01-02') AS A_INTERVAL_TIME_MINUTE
                FROM DUAL`,
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
                properties: {
                  A_SIMPLE_DATE: {type: ["null", "string"], date: true},
                  A_TEST_DATE: {type: ["null", "string"], date: true},
                  A_TZ_TIMESTAMP: {type: ["null", "string"], date: true},
                  A_INTERVAL: {type: ["null", "string"], date: true},
                  A_INTERVAL_TIME_MINUTE: {
                    type: ["null", "string"],
                    date: true,
                  },
                },
              },
            })
          );

          expect(row).to.equal(
            JSON.stringify({
              A_SIMPLE_DATE: "2005-04-04T14:30:00.000Z",
              A_TEST_DATE: "1989-01-15T16:00:00.000Z",
              A_TZ_TIMESTAMP: "1999-12-01T19:00:00.000Z",
              A_INTERVAL: "1989-04-26T02:00:00.000Z",
              A_INTERVAL_TIME_MINUTE: "1990-03-15T16:00:00.000Z",
            })
          );

          resolve();
        }
      });
    });
  });
});
