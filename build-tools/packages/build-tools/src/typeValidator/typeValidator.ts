/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import program from "commander";

/**
 * argument parsing
 */
program
	.option("-d|--packageDir <dir>", "The root directory of the package")
	.option(
		"-m|--monoRepoDir <dir>",
		"The root directory of the mono repo, under which there are packages.",
	)
	.option(
		"-p|--preinstallOnly",
		"Only prepares the package json. Doesn't generate tests. This should be done before npm install",
	)
	.option(
		"-g|--generateOnly",
		"This only generates the tests. If does not prepare the package.json",
	)
	.option("--generateInName", "Includes .generated in the output filename.")
	.option("-v|--verbose", "Verbose logging mode")
	.parse(process.argv);

async function run(): Promise<boolean> {
	console.error(
		`fluid-type-validator is deprecated. Install @fluid-tools/build-cli instead and use 'flub generate typetests.`,
	);
	return false;
}

run()
	.then((success) => process.exit(success ? 0 : 1))
	.catch(() => process.exit(2));
