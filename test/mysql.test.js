import assert from "node:assert";
import MockReq from "mock-req";
import MockRes from "mock-res";
import logger from "../middleware/logger.js";
import mysql from "../lib/mysql.js";

import {MYSQL_CREDENTIALS} from "../.env.test.js";
const index = logger(mysql(MYSQL_CREDENTIALS));

describe("MySQL", () => {
  describe("when checking", () => {
    it("should do MySQL credential check", () => {
      const req = new MockReq({method: "POST", url: "/check"});
      const res = new MockRes();

      return index(req, res).then(
        () => Promise.reject("Expect call to throw!"),
        (err) => {
          assert.equal(
            /User has too permissive grants/.test(err.message),
            true
          );
        }
      );
    });
  });
});
