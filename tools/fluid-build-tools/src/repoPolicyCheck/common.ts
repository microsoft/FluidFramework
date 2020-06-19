import * as fs from "fs";
import { EOL as newline } from "os";

/**
 * each handler has a name for filtering and a match regex for matching which files it should resolve
 * the handler function returns an error message or undefined/null for success
 * the resolver function (optional) can attempt to resolve the failed validation
 */
export interface Handler {
  name: string,
  match: RegExp,
  handler: (file: string) => string | undefined,
  resolver?: (file: string) => { resolved: boolean, message?: string };
};

export function readFile(file: string) {
  return fs.readFileSync(file, { encoding: "utf8" });
}

export function writeFile(file: string, data: string) {
  fs.writeFileSync(file, data, { encoding: "utf8" });
}

export const copyrightText = "Copyright (c) Microsoft Corporation. All rights reserved." + newline + "Licensed under the MIT License.";
export const licenseId = 'MIT';
export const author = 'Microsoft';
