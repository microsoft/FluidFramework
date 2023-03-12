/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export interface LernaOutput {
	name: string;
	version: string;
	private: string;
	location: string;
}

/**
 * Gets and parses a LernaOutput from child process
 * @param input - child prcess buffer
 */
export function getLernaOutput(): LernaOutput[] {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const lernaOutput: LernaOutput[] = JSON.parse(
			child_process.execSync("npx lerna list --all --json").toString(),
		);
		if (!Array.isArray(lernaOutput)) {
			// eslint-disable-next-line unicorn/prefer-type-error
			throw new Error("stdin input was not package array");
		}
		return lernaOutput;
	} catch (error) {
		console.error(error);
		process.exit(-1);
	}
}

function main(): void {
	// Get the lerna output
	const lernaOutput: LernaOutput[] = getLernaOutput();

	// Assign a unique port to each package
	const portMap: { [pkgName: string]: number } = {};
	let port = 8081;
	for (const pkg of lernaOutput) {
		if (pkg.name === undefined) {
			console.error("missing name in lerna package entry");
			process.exit(-1);
		}
		portMap[pkg.name] = port++;
	}

	// Write the mappings to a temporary file as kv pairs
	const portMapPath = path.join(os.tmpdir(), "testportmap.json");
	fs.writeFileSync(portMapPath, JSON.stringify(portMap));
}

main();
