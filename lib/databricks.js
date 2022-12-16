export class DatabricksSingleton {
  static instance = null;

  constructor() {
    throw new Error(
      "Do not use new OracleSingleton(). Call OracleSingleton.initialize() instead."
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
    await connection.openSession();
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
