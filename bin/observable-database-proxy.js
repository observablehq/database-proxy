#!/usr/bin/env node

import {start, add, remove, reset, list} from "../lib/commands.js";
import argv from "yargs";

const name = (yargs) =>
  yargs.positional("name", {
    describe: "Database connector name",
    type: "string",
  });

argv
  .usage(`Usage: $0 <command> <name> [options]`)
  .command(
    `start <name> [options]`,
    `Start a database proxy server`,
    name,
    start
  )
  .command(`add <name>`, `Add a new database proxy configuration`, name, add)
  .command(
    `remove <name>`,
    `Remove an existing database proxy configuration`,
    name,
    remove
  )
  .command(
    `reset <name>`,
    `Reset the shared secret for an existing database proxy configuration`,
    name,
    reset
  )
  .command(`list`, `List all configured database proxies`, {}, list)
  .demandCommand(1, `A command is required`)
  .describe(
    `sslcert`,
    `Set the SSL certificate location for an HTTPS database proxy`
  )
  .describe(
    `sslkey`,
    `Set the SSL private key location for an HTTPS database proxy`
  )
  .example(`$0 start localdb`, `Run an HTTP database proxy named "localdb"`)
  .example(
    `$0 start localssl --sslkey ../ssl/localhost.key --sslcert ../ssl/localhost.crt`,
    `Run an HTTPS database proxy named "localssl"`
  )
  .example(`$0 add localdb`, `Configure a new database proxy named "localdb"`)
  .recommendCommands().argv;
