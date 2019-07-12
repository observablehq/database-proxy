import {createError} from "micro";
export const unauthorized = error => createError(401, "Unauthorized", error);
export const notFound = error => createError(404, "Not Found", error);
export const exit = message => {
  console.error(message); // eslint-disable-line no-console
  process.exit(1);
};
