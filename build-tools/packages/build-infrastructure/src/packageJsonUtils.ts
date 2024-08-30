/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import detectIndent from "detect-indent";
import { writeJson, writeJsonSync } from "fs-extra";
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
 *
 * @internal
 */
export function updatePackageJsonFile<J extends PackageJson = PackageJson>(
	packagePath: string,
	packageTransformer: (json: J) => void,
): void {
	packagePath = packagePath.endsWith("package.json")
		? packagePath
		: path.join(packagePath, "package.json");
	const [pkgJson, indent] = readPackageJsonAndIndent<J>(packagePath);

	// Transform the package.json
	packageTransformer(pkgJson);

	writePackageJson(packagePath, pkgJson, indent);
}

/**
 * Reads a package.json file from a path, detects its indentation, and returns both the JSON as an object and
 * indentation.
 *
 * @internal
 */
export function readPackageJsonAndIndent<J extends PackageJson = PackageJson>(
	pathToJson: string,
): [json: J, indent: string] {
	const contents = readFileSync(pathToJson).toString();
	const indentation = detectIndent(contents).indent || "\t";
	const pkgJson: J = JSON.parse(contents);
	return [pkgJson, indentation];
}

/**
 * Writes a PackageJson object to a file using the provided indentation.
 */
export function writePackageJson<J extends PackageJson = PackageJson>(
	packagePath: string,
	pkgJson: J,
	indent: string,
) {
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
 *
 * @internal
 */
export async function updatePackageJsonFileAsync<J extends PackageJson = PackageJson>(
	packagePath: string,
	packageTransformer: (json: J) => Promise<void>,
): Promise<void> {
	packagePath = packagePath.endsWith("package.json")
		? packagePath
		: path.join(packagePath, "package.json");
	const [pkgJson, indent] = await readPackageJsonAndIndentAsync<J>(packagePath);

	// Transform the package.json
	await packageTransformer(pkgJson);

	await writeJson(packagePath, sortPackageJson(pkgJson), { spaces: indent });
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
		const pkgJson: J = JSON.parse(contents);
		return [pkgJson, indentation];
	});
}
