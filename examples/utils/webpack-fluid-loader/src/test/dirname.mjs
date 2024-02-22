import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Problem:
// '__dirname' has been removed in node ESM modules
// 'import.meta.url' is inaccessible in CJS modules
//
// Workaround:
// Dynamic import of *.mjs file to force ESM
export const _dirname = dirname(fileURLToPath(import.meta.url));
