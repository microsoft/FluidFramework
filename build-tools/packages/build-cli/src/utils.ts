/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";

/**
 * Reads a file into an array of strings, one line per array element.
 */
export async function readLines(filePath: string): Promise<string[]> {
	const content = await readFile(filePath, "utf8");
	const lines = content.split(/\r?\n/);
	return lines.filter((line) => line.trim() !== "");
}
