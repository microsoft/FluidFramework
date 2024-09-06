/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultLogger } from "../../common/logging";
import { tsCompile } from "../tsCompile";

const { log, errorLog: error } = defaultLogger;

function printUsage() {
	log(
		`
Runs tsc using arguments given in an environment where local package.json "type" property is overridden. This enables single package to support both CommonJS and ESM.

Warning: Use this dual build approach carefully as consumers must be careful not to depend on both CommonJS and ESM versions of the same package.

Usage: fluid-tsc [commonjs|module] [<tsc args>...]
    [commonjs|module] value for package.json "type" property
    [<tsc args>...] arguments passed to Typescript compiler (see tsc -?)

Example: fluid-tsc commonjs --project tsconfig.cjs.json
`,
	);
}

async function main() {
	const firstArg = process.argv[2];

	if (firstArg === "-?" || firstArg === "--help") {
		printUsage();
		process.exit(0);
	}

	if (firstArg !== "commonjs" && firstArg !== "module") {
		throw new Error(
			`fluid-tsc's first argument must be 'commonjs' or 'module'. Was: ${firstArg}`,
		);
	}

	const command = `tsc ${process.argv.slice(3).join(" ")}`;
	const result = tsCompile(
		{ command, cwd: process.cwd(), packageJsonTypeOverride: firstArg },
		"allow-watch",
	);
	// In watch mode, there is no result code and the process must be left to continue running.
	if (result !== undefined) {
		process.exit(result);
	}
}

main().catch((e) => {
	error(`Unexpected error. ${e.message}`);
	error(e.stack);
	process.exit(1);
});
