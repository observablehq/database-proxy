import LRU from "lru-cache";
import * as Sentry from "@sentry/node";

const ttl = 1000 * 60 * 10; // 10m

export default class Pools {
  constructor(createPool) {
    this.createPool = createPool;
    this.cache = new LRU({
      max: 100,
      ttl,
      updateAgeOnGet: true,
      dispose(_key, pool) {
        pool.end();
      },
    });

    let loop;
    (loop = () => {
      this.cache.purgeStale();
      this.timeout = setTimeout(loop, ttl / 2);
    })();
  }

  async get(credentials) {
    const key = JSON.stringify(credentials);
    if (this.cache.has(key)) return this.cache.get(key);
    const pool = await this.createPool(credentials);

    pool.on("error", (error) => {
      // We need to attach a handler otherwise the process could exit, but we
      // just don't care about these errors because the client will get cleaned
      // up already. For debugging purposes, we'll add a Sentry breadcrumb if
      // something else errors more loudly.
      Sentry.addBreadcrumb({
        message: error.message,
        category: "pool",
        level: "error",
        data: error,
      });
    });

    this.cache.set(key, pool);
    return pool;
  }

  del(credentials) {
    this.cache.del(JSON.stringify(credentials));
  }

  end() {
    if (this.timeout) clearTimeout(this.timeout);
    for (const pool of this.cache.values()) pool.end();
  }
}
