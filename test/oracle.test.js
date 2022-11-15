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
});
