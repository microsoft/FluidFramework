/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";

import { updatePackageJsonFile, updateTypeTestConfiguration } from "./typeTestConfigUtil";

program
	.option("-r|--reset", "Reset broken types data")
	.option("-p|--previous <version string>", "set the version to test against")
	.parse(process.argv);

updatePackageJsonFile(".", (json) =>
	updateTypeTestConfiguration(json, {
		resetBroken: !!program.reset,
		version: program.previous,
	}),
);
