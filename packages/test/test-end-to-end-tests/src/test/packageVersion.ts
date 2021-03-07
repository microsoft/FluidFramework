/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Unlike normal packageVersion.ts, this is not generated.  Just import from package.json
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pkgJson = require("../../package.json");
export const pkgName: string = pkgJson.name;
export const pkgVersion: string = pkgJson.version;
