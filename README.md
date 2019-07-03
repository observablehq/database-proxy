# @observablehq/database-proxy

## Running

Usage: observable-database-proxy DATABASE_URL ORIGIN

Run a proxy for the database found at DATABASE_URL, allowing only the remote
origin ORIGIN.

> $ observable-database-proxy postgres://localhost https://worker.test:5000

## Using from notebooks

After the proxy is running, call `DatabaseClient()` without a name to get a
client pointed at your local proxy. When querying, data never leaves your
local computer and database credentials are never sent to Observable.
