/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
