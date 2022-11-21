import {expect} from "chai";
import MockReq from "mock-req";
import MockRes from "mock-res";

import oracle from "../lib/oracle.js";
import {ORACLE_CREDENTIALS} from "../.env.test.js";

const credentials = ORACLE_CREDENTIALS;

describe("oracle", async (done) => {
  describe("when checking", () => {
    describe("with a READ_ONLY user", () => {
      it("should return ok", async () => {
        const req = new MockReq({
          method: "POST",
          url: "/check",
        });
        const res = new MockRes();
        const index = oracle(credentials);

        const response = await index(req, res);

        expect(response.statusCode).to.equal(200);
        expect(response.body.ok).to.equal(true);
      });
    });
  });
});
