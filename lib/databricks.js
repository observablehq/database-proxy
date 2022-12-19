export class DatabricksSingleton {
  static instance = null;

  constructor() {
    throw new Error(
      "Do not use new DatabricksSingleton(). Call DatabricksSingleton.initialize() instead."
    );
  }
  static initialize() {
    if (!DatabricksSingleton.instance) {
      try {
        DatabricksSingleton.instance = import("@databricks/sql").then(
          (module) => module.default
        );
      } catch (err) {
        console.error(err);
      }
    }
  }
  static getInstance() {
    if (!DatabricksSingleton.instance)
      throw new Error(
        "DatabricksSingleton not initialized. Call DatabricksSingleton.initialize() first."
      );
    return DatabricksSingleton.instance;
  }
}

/*
 * This function is checking for the validity of the credentials.
 * */
export async function check(req, res, connection) {
  try {
    // If a session fails to open, currently the error is not propagating correctly.
    // see: https://github.com/databricks/databricks-sql-nodejs/issues/77
    await new Promise((resolve, reject) => {
      connection.on("error", reject).openSession().then(resolve);
    });

    return {ok: true};
  } catch (e) {
    throw e;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err.message);
      }
    }
  }
}

export default ({token, host, path}) => {
  DatabricksSingleton.initialize();
  return async (req, res) => {
    const databricks = await DatabricksSingleton.getInstance();
    const client = new databricks.DBSQLClient();
    const connection = await client.connect({token, host, path});

    // TODO: replace with queryStream method when implemented
    return check(req, res, connection);
  };
};
