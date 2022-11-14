import {expect, assert} from "chai";
import mssql from "mssql";
import {MSSQL_CREDENTIALS} from "../.env.test.js";
import pools, {pools as globalPool} from "../lib/pools.js";

const mssql_creds = MSSQL_CREDENTIALS;

describe("pools", () => {
  describe("when working with mssql", () => {
    let pool;
    before(async () => {
      pool = await pools.get(JSON.stringify(mssql_creds), mssql_creds, "mssql");
    });

    it("should add and get a mssql pool of connection to the global pool", async () => {
      expect(pool.constructor.name === mssql.ConnectionPool.name).to.be.true;
    });
  });

  describe("when finding wrong config or driver", () => {
    it("should throw if no config", () => {
      assert.throws(
        () => pools.get("NOT_A_VALID_DRIVER", null),
        "Database configuration required"
      );
    });

    it("should throw if no driver", () => {
      assert.throws(
        () => pools.get("NOT_A_VALID_DRIVER", {}, null),
        "Driver is required"
      );
    });

    it("should throw if driver is not supported", () => {
      assert.throws(
        () => pools.get("NOT_A_VALID_DRIVER", {}, "NOT_A_VALID_DRIVER"),
        "Driver must be one of: mssql"
      );
    });
  });

  describe("when onCloseAll", () => {
    before(async () => {
      await pools.get(JSON.stringify(mssql_creds), mssql_creds, "mssql");
    });

    it("should delete all pools from the global pool", async () => {
      expect(globalPool.size > 0).to.be.true;
      await pools.closeAll();
      expect(globalPool.size).to.equal(0);
    });
  });
});
