import serializeError from "serialize-error";

export default handler => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error(error); // eslint-disable-line no-console
    res.statusCode = error.statusCode || 500;
    return serializeError(error);
  }
};
