export const pools = new Map();

export default {
  get: (config, setup) => {
    const key = JSON.stringify(config);

    if (!pools.has(key)) {
      if (!config) {
        throw new Error("Database configuration required");
      }

      if (!setup) {
        throw new Error("Setup callback is required");
      }

      setup(config, pools);
    }

    return pools.get(key);
  },
  closeAll: () =>
    Promise.all(
      Array.from(pools.values()).map((connect) => {
        return connect.then((pool) => pool.close());
      })
    ),
};
