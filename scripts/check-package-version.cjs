/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script is used in CI to compare the version in a package's package.json to the expected version we're releasing,
 * which is set in the SETVERSION_VERSION environment variable.
 */

const fs = require("fs");

if(process.env.SETVERSION_VERSION === undefined) {
  console.error("SETVERSION_VERSION env variable is undefined");
  process.exit(1);
}

const json = JSON.parse(fs.readFileSync("./package.json"));
const pkg_version = json.version;
if (pkg_version !== process.env.SETVERSION_VERSION) {
	console.error(`versions don't match: ${json.name}`);
  process.exit(1);
}

process.exit(0);
