import { createError } from "micro";
export const unauthorized = error => createError(401, "Unauthorized", error);
export const notFound = error => createError(404, "Not Found", error);
