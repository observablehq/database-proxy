# @observablehq/database-proxy

The database proxy is a simple Node.js webserver that accepts secure requests from your Observable notebooks, and proxies queries to a PostgreSQL, MySQL, Snowflake, SQL Server, Databricks or Oracle database — one that is not necessarily exposed to the web. You can use the database proxy to securely connect to databases on your local computer, on an intranet or within a VPN.

## Installation

Install the database proxy locally or globally with `npm` or `yarn`:

```
  npm install -g @observablehq/database-proxy
  yarn global add @observablehq/database-proxy
```

### Installing for Oracle Databases

To use the Oracle database client, you will also need to install the `oracledb` npm library with `npm` or `yarn`: 
```
  npm install -g oracledb
  yarn global add oracldeb
```
#### Architecture 
Node-oracledb is an [add-on](https://nodejs.org/api/addons.html) available as C source code. Pre-built binaries are available as a convenience for common architectures (Windows 64-bit, Linux x86_64, and macOS (Intel x86)). For other architectures (i.e `macOS (ARM64)`), you will need to build from the source code as described [here](https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html#quick-start-node-oracledb-installation). 

#### Oracle Client Library
One of the Oracle Client libraries version 21, 19, 18, 12, or 11.2 needs to be installed in your operating system library search path such as `PATH` on Windows or `LD_LIBRARY_PATH` on Linux. On macOS link the libraries to `/usr/local/lib`.

For more information see [node-oracldb](https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html) documentation.

## Running the database proxy

Usage: `observable-database-proxy <command> <name> [options]`

Commands:

- `start <name> [ssl options]` Start a database proxy server
- `add <name>` Add a new database proxy configuration
- `remove <name>` Remove an existing database proxy configuration
- `reset <name>` Reset the shared secret for an existing database proxy configuration
- `list` List all configured database proxies

When adding a database proxy configuration, a window will be opened to ObservableHQ.com to configure the connection in your Database Settings and set the shared secret. Subsequent starts of the database proxy do not require re-configuration.

Examples:

```
  $ observable-database-proxy start localdb

  $ observable-database-proxy add localssl
  $ observable-database-proxy start localssl --sslcert ~/.ssl/localhost.crt --sslkey ~/.ssl/localhost.key
```

## Configuration storage

All proxy configuration is stored in `~/.observablehq`. You can delete the file to remove all of your database proxy configuration at once.

## SSL Certificates

If you’re using Chrome or Edge, and running the database proxy on your local computer (at 127.0.0.1), you can connect to it directly with HTTP — there’s no need to set up a self-signed SSL certificate for the proxy.

If you’re using Firefox or Safari, or if you wish to run the database proxy on a different computer on your intranet, you can create a self-signed SSL certificate and configure the database proxy to use it in order to proxy over HTTPS. Be sure to “Require SSL/TLS” in the Observable configuration, and specify the `--sslcert` and `--sslkey` options when running the database proxy.

## Using from notebooks

After the proxy is running, in one of your private notebooks, use `DatabaseClient("name")` to create a database client pointed at your local proxy. When querying, your data and database credentials never leave your local computer. Please check [this notebook for more information on how to use it from Observable](https://observablehq.com/@observablehq/self-hosted-database-proxies)
