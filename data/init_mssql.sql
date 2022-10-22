RESTORE DATABASE test
    FROM DISK = '/var/opt/mssql/backup/test.bak'
    WITH REPLACE, RECOVERY,
    MOVE 'AdventureWorksLT2012_Data' TO '/var/opt/mssql/data/aw2019.mdf',
    MOVE 'AdventureWorksLT2012_Log'  TO '/var/opt/mssql/data/aw2019.ldf';