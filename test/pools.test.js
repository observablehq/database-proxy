import {expect, assert} from "chai";
import mssql from "mssql";
import {MSSQL_CREDENTIALS} from "../.env.test.js";

import pools, {pools as globalPool} from "../lib/pools.js";
import {addToPools} from "../lib/mssql.js";

const mssql_creds = MSSQL_CREDENTIALS;

describe("pools", () => {
  describe("when working with mssql", () => {
    let pool;
    before(async () => {
      pool = await pools.get(mssql_creds, addToPools);
    });

    it("should add and get a mssql pool of connection to the global pool", async () => {
      expect(pool.constructor.name === mssql.ConnectionPool.name).to.be.true;
    });
  });

  describe("when finding wrong config or driver", () => {
    it("should throw if no addToPools", () => {
      assert.throws(
        () => pools.get(null, null),
        "Database configuration required"
      );
    });
    it("should throw if no addToPools", () => {
      assert.throws(
        () => pools.get({name: "NOT_A_VALID_DRIVER"}, null),
        "Setup callback is required"
      );
    });
  });

  describe("when onCloseAll", () => {
    before(async () => {
      await pools.get(mssql_creds, addToPools);
    });

    it("should delete all pools from the global pool", async () => {
      expect(globalPool.size > 0).to.be.true;
      await pools.closeAll();
      expect(globalPool.size).to.equal(0);
    });
  });
});
