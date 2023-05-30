/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fs } from "fs";
import { Serializable } from "@fluidframework/datastore-definitions";

const NUMBER_SPACES = 4;

export async function createSnapshotAsync(path: string, data: Serializable): Promise<void> {
	const dataStr = JSON.stringify(data, undefined, NUMBER_SPACES);
	await fs.writeFile(path, dataStr);
}

export async function isEqualPastSnapshotAsync(path: string, data: Serializable): Promise<boolean> {
	const dataStr = JSON.stringify(data, undefined, NUMBER_SPACES);
	const pastDataStr = await fs.readFile(path, "utf-8");

	return dataStr === pastDataStr;
}
