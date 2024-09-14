/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";

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
