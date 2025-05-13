/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { isObject } from "@fluidframework/core-utils/internal";
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";

import type { IDirectory } from "../../interfaces.js";

/**
 * Asserts that the 2 provided directories have equivalent contents.
 */
export async function assertEquivalentDirectories(
	first: IDirectory,
	second: IDirectory,
): Promise<void> {
	await assertEventualConsistencyCore(
		first.getWorkingDirectory("/"),
		second.getWorkingDirectory("/"),
	);
}

async function assertEventualConsistencyCore(
	first: IDirectory | undefined,
	second: IDirectory | undefined,
): Promise<void> {
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
		const firstVal: unknown = first.get(key);
		const secondVal: unknown = second.get(key);
		if (isObject(firstVal) === true) {
			assert(
				isObject(secondVal),
				`Values differ at key ${key}: first is an object, second is not`,
			);
			const firstHandle = isFluidHandle(firstVal)
				? toFluidHandleInternal(firstVal).absolutePath
				: firstVal;
			const secondHandle = isFluidHandle(secondVal)
				? toFluidHandleInternal(secondVal).absolutePath
				: secondVal;
			assert.equal(
				firstHandle,
				secondHandle,
				`Key not found or value not matching ` +
					`key: ${key}, value in dir first at path ${first.absolutePath}: ${JSON.stringify(
						firstHandle,
					)} and in second at path ${second.absolutePath}: ${JSON.stringify(secondHandle)}`,
			);
		} else {
			assert.strictEqual(
				firstVal,
				secondVal,
				`Key not found or value not matching ` +
					`key: ${key}, value in dir first at path ${first.absolutePath}: ${first.get(
						key,
					)} and in second at path ${second.absolutePath}: ${second.get(key)}`,
			);
		}
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
		await assertEventualConsistencyCore(subDirectory1, subDirectory2);
	}

	// Check for consistency of subdirectories ordering of both directories
	const firstSubdirNames = [...first.subdirectories()].map(([dirName, _]) => dirName);
	const secondSubdirNames = [...second.subdirectories()].map(([dirName, _]) => dirName);
	assert.deepStrictEqual(firstSubdirNames, secondSubdirNames);
}
