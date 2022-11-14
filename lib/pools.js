import mssql from "mssql";

export const pools = new Map();

export default {
  get: (name, config, driver) => {
    if (!pools.has(name)) {
      if (!config) {
        throw new Error("Database configuration required");
      }

      if (!driver) {
        throw new Error("Driver is required");
      }

      let pool;
      switch (driver) {
        case "mssql":
          pool = new mssql.ConnectionPool(config);
          break;
        // TODO: Add other DB pools as we build and migrate them to database-proxy
        default:
          throw new Error("Driver must be one of: mssql");
      }

      const close = pool.close.bind(pool);
      pool.close = (...args) => {
        pools.delete(name);
        return close(...args);
      };

      pools.set(name, pool.connect());
    }

    return pools.get(name);
  },
  closeAll: () =>
    Promise.all(
      Array.from(pools.values()).map((connect) => {
        return connect.then((pool) => pool.close());
      })
    ),
};
