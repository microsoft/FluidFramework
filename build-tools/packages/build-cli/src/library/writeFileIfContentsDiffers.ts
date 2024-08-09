/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type PathLike } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

/**
 * Writes to a file, but first reads the contents to check if it matches the desired content. If it does, the operation
 * is skipped. Newlines are _always_ normalized to be line-feeds only for comparison. This effectively means that
 * newline differences are ignored when comparing the contents. However, if the file is written, then it will be written
 * as provided. For example, if `contents` is using CRLF newlines and the file is written, it will be written with CRLF
 * newlines.
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
		await writeFile(filePath, contents, "utf8");
		return true;
	}
	return false;
}
