/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

/**
 * each handler has a name for filtering and a match regex for matching which files it should resolve
 * the handler function returns an error message or undefined/null for success
 * the resolver function (optional) can attempt to resolve the failed validation
 */
export interface Handler {
  name: string,
  match: RegExp,
  handler: (file: string, root: string) => string | undefined,
  resolver?: (file: string, root: string) => { resolved: boolean, message?: string };
  final?: (root: string, resolve: boolean) => { error?: string } | undefined;
}

export function readFile(file: string) {
  return fs.readFileSync(file, { encoding: "utf8" });
}

export function writeFile(file: string, data: string) {
  fs.writeFileSync(file, data, { encoding: "utf8" });
}
