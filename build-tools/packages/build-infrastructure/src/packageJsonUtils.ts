/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import detectIndent from "detect-indent";
// Imports are written this way for CJS/ESM compat
import fsePkg from "fs-extra";
const { writeJson, writeJsonSync } = fsePkg;
import sortPackageJson from "sort-package-json";

import type { PackageJson } from "./types.js";

/**
 * Reads the contents of package.json, applies a transform function to it, then writes the results back to the source
 * file.
 *
 * @param packagePath - A path to a package.json file or a folder containing one. If the path is a directory, the
 * package.json from that directory will be used.
 * @param packageTransformer - A function that will be executed on the package.json contents before writing it
 * back to the file.
 *
 * @remarks
 *
 * The package.json is always sorted using sort-package-json.
 */
export function updatePackageJsonFile<J extends PackageJson = PackageJson>(
	packagePath: string,
	packageTransformer: (json: J) => void,
): void {
	const resolvedPath = packagePath.endsWith("package.json")
		? packagePath
		: path.join(packagePath, "package.json");
	const [pkgJson, indent] = readPackageJsonAndIndent<J>(resolvedPath);

	// Transform the package.json
	packageTransformer(pkgJson);

	writePackageJson(resolvedPath, pkgJson, indent);
}

/**
 * Reads a package.json file from a path, detects its indentation, and returns both the JSON as an object and
 * indentation.
 */
export function readPackageJsonAndIndent<J extends PackageJson = PackageJson>(
	pathToJson: string,
): [json: J, indent: string] {
	const contents = readFileSync(pathToJson).toString();
	const indentation = detectIndent(contents).indent || "\t";
	const pkgJson: J = JSON.parse(contents) as J;
	return [pkgJson, indentation];
}

/**
 * Writes a PackageJson object to a file using the provided indentation.
 */
export function writePackageJson<J extends PackageJson = PackageJson>(
	packagePath: string,
	pkgJson: J,
	indent: string,
): void {
	return writeJsonSync(packagePath, sortPackageJson(pkgJson), { spaces: indent });
}

/**
 * Reads the contents of package.json, applies a transform function to it, then writes
 * the results back to the source file.
 *
 * @param packagePath - A path to a package.json file or a folder containing one. If the
 * path is a directory, the package.json from that directory will be used.
 * @param packageTransformer - A function that will be executed on the package.json
 * contents before writing it back to the file.
 *
 * @remarks
 * The package.json is always sorted using sort-package-json.
 */
export async function updatePackageJsonFileAsync<J extends PackageJson = PackageJson>(
	packagePath: string,
	packageTransformer: (json: J) => Promise<void>,
): Promise<void> {
	const resolvedPath = packagePath.endsWith("package.json")
		? packagePath
		: path.join(packagePath, "package.json");
	const [pkgJson, indent] = await readPackageJsonAndIndentAsync<J>(resolvedPath);

	// Transform the package.json
	await packageTransformer(pkgJson);

	await writeJson(resolvedPath, sortPackageJson(pkgJson), { spaces: indent });
}

/**
 * Reads a package.json file from a path, detects its indentation, and returns both the JSON as an object and
 * indentation.
 */
async function readPackageJsonAndIndentAsync<J extends PackageJson = PackageJson>(
	pathToJson: string,
): Promise<[json: J, indent: string]> {
	return readFile(pathToJson, { encoding: "utf8" }).then((contents) => {
		const indentation = detectIndent(contents).indent || "\t";
		const pkgJson: J = JSON.parse(contents) as J;
		return [pkgJson, indentation];
	});
}
