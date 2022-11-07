import {mssqlPool} from "./mssql.js";

export async function closeAllPools() {
  console.log("dbproxy: closing all pools");
  return Promise.all([mssqlPool.closeAll()]);
}
