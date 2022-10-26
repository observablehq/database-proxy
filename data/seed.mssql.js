import mssql from "mssql";
import {MSSQL_CREDENTIALS} from "../.env.test.js";

const credentials = MSSQL_CREDENTIALS;

const seed = async () => {
  await mssql.connect(credentials);

  await mssql.query`RESTORE DATABASE test
    FROM DISK = '/var/opt/mssql/backup/test.bak'
    WITH REPLACE, RECOVERY,
    MOVE 'AdventureWorksLT2012_Data' TO '/var/opt/mssql/data/aw2019.mdf',
    MOVE 'AdventureWorksLT2012_Log'  TO '/var/opt/mssql/data/aw2019.ldf';`;

  await mssql.query`IF NOT EXISTS(SELECT name
                                  FROM sys.syslogins
                                  WHERE name='reader')
                     BEGIN
                       CREATE LOGIN reader WITH PASSWORD = 're@derP@ssw0rd'
                       CREATE USER reader FOR LOGIN reader
                     END`;
};

seed()
  .then(() => {
    console.log(`MS_SQL DB seeded.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message, err);
    process.exit(1);
  });
