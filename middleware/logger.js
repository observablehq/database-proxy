// Recursively flatten key names separated by dots.
function* entries(data, prefix = []) {
  if (
    data instanceof Object &&
    Object.getPrototypeOf(data) === Object.prototype
  ) {
    for (const [key, value] of Object.entries(data))
      yield* entries(value, prefix.concat(key));
  } else {
    yield [prefix.join("."), data];
  }
}

export default (handler) => (req, res) => {
  req.log = function log(data) {
    const requestId = req.headers["x-request-id"];
    const parts = requestId ? [`http.request_id=${requestId}`] : [];
    for (const [key, value] of entries(data)) parts.push(`${key}=${value}`);
    console.log(parts.join(" "));
  };
  return handler(req, res);
};
