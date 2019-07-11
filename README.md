# @observablehq/observable-database-proxy

The database proxy is a simple webserver that accepts secure requests from your Observable notebooks, and proxies queries to a PostgreSQL or MySQL database — one that is not necessarily exposed to the web. You can use the database proxy to securely connect to databases on your local computer, on an intranet or within a VPN.

## Installation

You can use `npx` to try out the database proxy as a one-off:

```
  npx @observablehq/observable-database-proxy <name>
```

Or install it globally with `npm` or `yarn`:

```
  npm install -g @observablehq/observable-database-proxy
  yarn global add @observablehq/observable-database-proxy
```

## Running the database proxy

Usage for HTTP on localhost: `observable-database-proxy <name>`
For HTTPS (on localhost or elsewhere): `observable-database-proxy <name> --sslcert <path-to-ssl.crt> --sslkey <path-to-ssl.key>`

The first time running the database proxy for a given connection name, a window will be opened to ObservableHQ.com to configure the connection, and set the shared secret. Subsequent starts of the database proxy do not require re-configuration.

To reset the configuration for a given database proxy, use: observable-database-proxy <name> --reset

```
  $ observable-database-proxy localdb
  $ observable-database-proxy localssl --sslcert ~/.ssl/localhost.crt --sslkey ~/.ssl/localhost.key
```

## SSL Certificates

If you’re using Chrome or Edge, and running the database proxy on your local computer (at 127.0.0.1), you can connect to it directly with HTTP — there’s no need to set up a self-signed SSL certificate for the proxy.

If you’re using Firefox or Safari, or if you wish to run the database proxy on a different computer on your intranet, you can create a self-signed SSL certificate and configure the database proxy to use it in order to proxy over HTTPS. Be sure to “Require SSL/TLS” in the Observable configuration, and specify the `--sslcert` and `--sslkey` options when running the database proxy.

## Using from notebooks

After the proxy is running, in one of your private notebooks, use `DatabaseClient("name")` to create a database client pointed at your local proxy. When querying, your data and database credentials never leave your local computer.
