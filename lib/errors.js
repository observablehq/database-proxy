import { createError } from "micro";
export const unauthorized = error => createError(401, "Unauthorized", error);
