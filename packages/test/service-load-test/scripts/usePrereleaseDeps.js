/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * This script will bump dependencies of this package to pre-release
 * so it can be installed standalone during CI outer loop
 */
const fs = require("fs");
const pkgFileName = "./package.json";
const pkg = JSON.parse(fs.readFileSync(pkgFileName, "utf-8"));
function replacer(key, value) {
  if (key.startsWith("@fluid") && value === `^${pkg.version}`) {
    return `${value}-0`;
  }
  return value;
}
fs.writeFileSync(pkgFileName, `${JSON.stringify(pkg, replacer, 2)}\n`);
