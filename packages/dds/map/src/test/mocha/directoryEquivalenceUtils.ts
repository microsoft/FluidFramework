/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { IDirectory } from "../../interfaces.js";

export function assertEquivalentDirectories(first: IDirectory, second: IDirectory): void {
	assertEventualConsistencyCore(first.getWorkingDirectory("/"), second.getWorkingDirectory("/"));
}

function assertEventualConsistencyCore(
	first: IDirectory | undefined,
	second: IDirectory | undefined,
): void {
	assert(first !== undefined, "first root dir should be present");
	assert(second !== undefined, "second root dir should be present");

	// Check number of keys.
	assert.strictEqual(
		first.size,
		second.size,
		`Number of keys not same: Number of keys ` +
			`in first at path ${first.absolutePath}: ${first.size} and in second at path ${second.absolutePath}: ${second.size}`,
	);

	// Check key/value pairs in both directories.
	for (const key of first.keys()) {
		assert.strictEqual(
			first.get(key),
			second.get(key),
			`Key not found or value not matching ` +
				`key: ${key}, value in dir first at path ${first.absolutePath}: ${first.get(
					key,
				)} and in second at path ${second.absolutePath}: ${second.get(key)}`,
		);
	}

	// Check for number of subdirectores with both directories.
	assert(first.countSubDirectory !== undefined && second.countSubDirectory !== undefined);
	assert.strictEqual(
		first.countSubDirectory(),
		second.countSubDirectory(),
		`Number of subDirectories not same: Number of subdirectory in ` +
			`first at path ${first.absolutePath}: ${first.countSubDirectory()} and in second` +
			`at path ${second.absolutePath}: ${second.countSubDirectory()}`,
	);

	// Check for consistency of subdirectores with both directories.
	for (const [name, subDirectory1] of first.subdirectories()) {
		const subDirectory2 = second.getSubDirectory(name);
		assert(
			subDirectory2 !== undefined,
			`SubDirectory with name ${name} not present in second directory`,
		);
		assertEventualConsistencyCore(subDirectory1, subDirectory2);
	}

	// Check for consistency of subdirectories ordering of both directories
	const firstSubdirNames = [...first.subdirectories()].map(([dirName, _]) => dirName);
	const secondSubdirNames = [...second.subdirectories()].map(([dirName, _]) => dirName);
	assert.deepStrictEqual(firstSubdirNames, secondSubdirNames);
}
