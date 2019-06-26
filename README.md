# @observablehq/data-local

## Running

Usage: data-local DATABASE_URL ORIGIN

Run a proxy for the database found at DATABASE_URL, allowing only the remote
origin ORIGIN.

> $ data-local postgres://localhost https://worker.test:5000

## SSL Certificates

The proxy uses a self-signed certificate. You can install it manually for
your system using `make install` or on a per-browser basis open
`https://127.0.0.1:2899` and mark it as trusted.

## Using from notebooks

After the proxy is running, call `DatabaseClient()` without a name to get a
client pointed at your local proxy. When querying, data never leaves your
local computer and database credentials are never sent to Observable.
