export const pools = new Map();
export const controller = new AbortController();

export function keyOf(config) {
  return JSON.stringify(config);
}

export default {
  get: (config, setup) => {
    const key = keyOf(config);

    if (!pools.has(key)) {
      if (!config) {
        throw new Error("Database configuration required");
      }

      if (!setup) {
        throw new Error("Setup callback is required");
      }

      setup(key, config, pools, controller);
    }

    return pools.get(key);
  },
  closeAll: () => controller.abort(),
};
