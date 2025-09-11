/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";

/**
 * each handler has a name for filtering and a match regex for matching which files it should resolve
 * the handler function returns an error message or undefined/null for success
 * the resolver function (optional) can attempt to resolve the failed validation
 */
export interface Handler {
	name: string;
	match: RegExp;

	/**
	 *
	 * @param file - Absolute path to the file.
	 * @param root - Path to the repo root. This can be used to make repo-relative paths if needed.
	 * @returns `undefined` if the check is successful. Otherwise returns an error message string.
	 */
	handler: (file: string, root: string) => Promise<string | undefined>;
	resolver?: (
		file: string,
		root: string,
	) =>
		| Promise<{ resolved: boolean; message?: string }>
		| { resolved: boolean; message?: string };
	final?: (root: string, resolve: boolean) => { error?: string } | undefined;
}

export function readFile(file: string): string {
	return fs.readFileSync(file, { encoding: "utf8" });
}

/**
 * Reads only the first portion of a file, useful for checking headers.
 * @param file - Absolute path to the file.
 * @param maxBytes - Maximum number of bytes to read. Defaults to 512.
 * @returns The first portion of the file as a string.
 */
export function readFilePartial(file: string, maxBytes: number = 512): string {
	const fd = fs.openSync(file, "r");
	try {
		const buffer = Buffer.alloc(maxBytes);
		const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
		return buffer.subarray(0, bytesRead).toString("utf8");
	} finally {
		fs.closeSync(fd);
	}
}

export function writeFile(file: string, data: string): void {
	fs.writeFileSync(file, data, { encoding: "utf8" });
}
