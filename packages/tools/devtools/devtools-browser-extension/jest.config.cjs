/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const getBaseJestConfig = require("@fluid-private/test-tools/getBaseJestConfig.cjs");
const { name } = require("./package.json");
const config = getBaseJestConfig(name);
config.testMatch = ["**/e2e-tests/?(*.)+(spec|test).[t]s"];
config.transform = {
	"^.+\\.test.ts?$": [
		"ts-jest",
		{
			tsconfig: "e2e-tests/tsconfig.json",
		},
	],
};
module.exports = config;
