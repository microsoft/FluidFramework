/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// flub exec "node /workspaces/f0/temp-tools/print.js" -g client | grep "/workspaces" > out

const path = require("path");
const fs = require("fs");

const pkgRoot = process.cwd();
const pkgPath = path.join(pkgRoot, "package.json");
const pkgText = fs.readFileSync(pkgPath, "utf8");

if (pkgText.indexOf("tsc-multi") !== -1) {
	console.log(`${pkgRoot}`);
}
