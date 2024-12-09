/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const getBaseJestConfig = require("../../../getBaseJestConfig.cjs");
const { name } = require("./package.json");
const config = getBaseJestConfig(name);
config.	moduleNameMapper = {
	// Remove explicit .js from local paths to allow jest to find the .ts* files
	"^(\\.{1,2}/.*)\\.js$": "$1",
};
module.exports = config;
