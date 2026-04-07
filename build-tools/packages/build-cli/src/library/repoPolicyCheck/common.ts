/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";
import {
	updatePackageJsonFile,
	updatePackageJsonFileAsync,
	type PackageJson,
} from "@fluid-tools/build-infrastructure";

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

export function writeFile(file: string, data: string): void {
	fs.writeFileSync(file, data, { encoding: "utf8" });
}

/**
 * Runs `updater` within {@link updatePackageJsonFile} and returns a resolver result.
 *
 * The `updater` callback may throw an `Error` to signal that the resolver could not fix the
 * policy violation. If the error has a non-empty message, it is included in the returned result.
 * If no error is thrown, the result will be `{ resolved: true }`.
 *
 * @param file - Absolute path to the package.json file.
 * @param updater - Function to update the package.json. Throw an `Error` to signal failure.
 * @returns A resolver result object indicating success or failure.
 */
export function runUpdatePackageJsonResolver(
	file: string,
	updater: (json: PackageJson) => void,
): { resolved: boolean; message?: string } {
	try {
		updatePackageJsonFile(path.dirname(file), updater);
		return { resolved: true };
	} catch (error: unknown) {
		const message = (error as Error).message;
		return { resolved: false, message: message !== "" ? message : undefined };
	}
}

/**
 * Async variant of {@link runUpdatePackageJsonResolver}.
 *
 * @param file - Absolute path to the package.json file.
 * @param updater - Async function to update the package.json. Throw an `Error` to signal failure.
 * @returns A resolver result object indicating success or failure.
 */
export async function runUpdatePackageJsonFileAsyncResolver(
	file: string,
	updater: (json: PackageJson) => Promise<void>,
): Promise<{ resolved: boolean; message?: string }> {
	try {
		await updatePackageJsonFileAsync(path.dirname(file), updater);
		return { resolved: true };
	} catch (error: unknown) {
		const message = (error as Error).message;
		return { resolved: false, message: message !== "" ? message : undefined };
	}
}
