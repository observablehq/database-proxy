# @observablehq/database-proxy

## Running

Usage: observable-database-proxy

Run a proxy.

> \$ observable-database-proxy

## SSL Certificates

## Using from notebooks

After the proxy is running, call `DatabaseClient()` without a name to get a
client pointed at your local proxy. When querying, data never leaves your
local computer and database credentials are never sent to Observable.
