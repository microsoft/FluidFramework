/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readJsonSync, writeJsonSync } from "fs-extra";
import path from "node:path";
import sortPackageJson from "sort-package-json";
import { PackageJson } from "../common/npmPackage";

export enum VersionOptions {
	Clear,
	Previous,
	ClearIfDisabled,
}

/**
 * Actions that can be taken when configuring type tests.
 */
export interface TypeTestConfigActions {
	/**
	 * If set, update version to test against to this.
	 * If empty string, remove previous version.
	 */
	version?: string | VersionOptions;

	/**
	 * If true delete "broken" entries (therefore enabling the tests for them again).
	 */
	resetBroken?: boolean;
}

function previousVersion(version: string): string {
	const parts = version.split(".");
	for (let index = parts.length - 1; index >= 0; index--) {
		const element = parts[index];
		if (element !== "0") {
			const numeric = Number(element);
			if (String(Number) !== element) {
				throw new Error(`Unable to lower non-numeric version "${element}" of "${version}"`);
			}
			parts[index] = String(numeric - 1);
			return parts.join(".");
		}
	}
	throw new Error(`Unable to lower version "${version}"`);
}

/**
 * Updates configuration for type tests in package.json
 */
export function updateTypeTestConfiguration(
	pkgJson: PackageJson,
	options: TypeTestConfigActions,
): void {
	if (options.version !== undefined) {
		const oldDepName = `${pkgJson.name}-previous`;

		// Packages can explicitly opt out of type tests by setting typeValidation.disabled to true.
		const enabled = pkgJson.typeValidation?.disabled !== true;

		if (!enabled || options.version === VersionOptions.Clear) {
			delete pkgJson.devDependencies[oldDepName];
		} else if (options.version !== VersionOptions.ClearIfDisabled) {
			const newVersion: string =
				options.version === VersionOptions.Previous
					? previousVersion(pkgJson.version)
					: options.version;
			pkgJson.devDependencies[oldDepName] = `npm:${pkgJson.name}@${newVersion}`;
		}
	}

	if (options.resetBroken) {
		if (pkgJson.typeValidation !== undefined) {
			pkgJson.typeValidation.broken = {};
		}
	}
}

/**
 * Update package.json
 */
export function updatePackageJsonFile(packageDir: string, f: (json: PackageJson) => void): void {
	const packagePath = path.join(packageDir, "package.json");
	const pkgJson: PackageJson = readJsonSync(packagePath);
	f(pkgJson);
	writeJsonSync(path.join(packagePath), sortPackageJson(pkgJson), { spaces: "\t" });
}
