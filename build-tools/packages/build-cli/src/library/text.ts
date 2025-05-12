/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";

/**
 * Indent text by prepending spaces.
 */
export function indentString(str: string, indentNumber = 2): string {
	const ind = getIndent(indentNumber);
	return `${ind}${str}`;
}

/**
 * Returns a string of spaces.
 */
export function getIndent(indentNumber = 2): string {
	return " ".repeat(indentNumber);
}

/**
 * Reads a file into an array of strings, one line per array element.
 */
export async function readLines(filePath: string): Promise<string[]> {
	const content = await readFile(filePath, "utf8");
	const lines = content.split(/\r?\n/);
	return lines.filter((line) => line.trim() !== "");
}

/**
 * Writes to a file, replacing any CRLF line-endings with LF. If the file data is not a string, this function behaves
 * the same as writeFile.
 */
export async function writeFileWithLineFeeds(
	...args: Parameters<typeof writeFile>
): Promise<void> {
	const [filePath, data, options] = args; // Destructure positional arguments
	return writeFile(
		filePath,
		typeof data === "string" ? data.replace(/\r\n/g, "\n") : data,
		options,
	);
}
