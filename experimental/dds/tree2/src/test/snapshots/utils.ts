/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { promises as fs, existsSync } from "fs";
import { Serializable } from "@fluidframework/datastore-definitions";

const numberOfSpaces = 4;

export async function createSnapshot(path: string, data: Serializable): Promise<void> {
	const dataStr = JSON.stringify(data, undefined, numberOfSpaces);
	await fs.writeFile(path, dataStr);
}

export async function verifyEqualPastSnapshot(path: string, data: Serializable): Promise<void> {
	assert(existsSync(path), `test snapshot file does not exist: ${path}`);
	const dataStr = JSON.stringify(data, undefined, numberOfSpaces);
	const pastDataStr = await fs.readFile(path, "utf-8");

	assert.equal(dataStr, pastDataStr);
}
