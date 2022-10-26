import mssql from "mssql";
import {MSSQL_CREDENTIALS} from "../.env.test.mjs";

const credentials = MSSQL_CREDENTIALS

const seed = async () => {
  await mssql.connect(credentials);
  await mssql.query`RESTORE DATABASE test
    FROM DISK = '/var/opt/mssql/backup/test.bak'
    WITH REPLACE, RECOVERY,
    MOVE 'AdventureWorksLT2012_Data' TO '/var/opt/mssql/data/aw2019.mdf',
    MOVE 'AdventureWorksLT2012_Log'  TO '/var/opt/mssql/data/aw2019.ldf';`;
};

seed()
  .then(() => {
    console.log(`MS_SQL DB seeded.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message, err);
    process.exit(1)
  });
