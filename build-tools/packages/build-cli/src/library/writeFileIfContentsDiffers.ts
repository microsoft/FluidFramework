/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";
import { type PathLike } from "node:fs";

/**
 * Writes to a file, but first reads the contents to check if it matches the desired content. If it does, the operation
 * is skipped. Newlines are _always_ normalized to be line-feeds only. This pplies to both the input and the written
 * contents. This means this function _cannot_ be used to output carriage-return/line-feed line endings.
 *
 * @param filePath - The path to the file to write.
 * @param contents - The contents to write to the file.
 * @returns True if the file was written; false otherwise.
 */
export async function writeFileIfContentsDiffers(
	filePath: PathLike,
	contents: string,
): Promise<boolean> {
	const fileContents = await readFile(filePath, { encoding: "utf8" });
	const normalizedFileContents = fileContents.replace(/\r\n/g, "\n");
	const normalizedNewContents = contents.replace(/\r\n/g, "\n");

	if (normalizedFileContents !== normalizedNewContents) {
		await writeFile(filePath, normalizedNewContents);
		return true;
	}
	return false;
}
