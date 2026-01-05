/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { IPackage } from "@fluid-tools/build-infrastructure";
import {
	type VersionBumpType,
	bumpVersionScheme,
	isInternalVersionScheme,
} from "@fluid-tools/version-tools";
import { inc } from "semver";

/**
 * Escapes special regex characters in a string to make it safe for use in a RegExp.
 */
function escapeRegex(str: string): string {
	return str.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
}

/**
 * Replaces all occurrences of a search string with a replacement string in a file.
 * The search string is treated as a literal string, not a regex pattern.
 *
 * @param search - The literal string to search for (will be escaped for regex safety)
 * @param replace - The string to replace matches with
 * @param filePath - The path to the file to modify
 * @throws Error if the file cannot be read or written
 */
async function replaceInFile(
	search: string,
	replace: string,
	filePath: string,
): Promise<void> {
	try {
		const content = await readFile(filePath, "utf8");
		const escapedSearch = escapeRegex(search);
		const newContent = content.replace(new RegExp(escapedSearch, "g"), replace);
		await writeFile(filePath, newContent, "utf8");
	} catch (error) {
		throw new Error(
			`Failed to replace "${search}" with "${replace}" in file ${filePath}: ${error}`,
		);
	}
}

export async function updateChangelogs(
	pkg: IPackage,
	bumpType: VersionBumpType,
	version?: string,
): Promise<void> {
	if (pkg.isReleaseGroupRoot || pkg.isWorkspaceRoot) {
		// No changelog for root packages.
		return;
	}
	const { directory, version: pkgVersion } = pkg;

	// This is the version that the changesets tooling calculates by default. It does a bump of the highest semver type
	// in the changesets on the current version. We search for that version in the generated changelog and replace it
	// with the one that we want.
	const changesetsCalculatedVersion = isInternalVersionScheme(pkgVersion)
		? bumpVersionScheme(pkgVersion, bumpType, "internal")
		: inc(pkgVersion, bumpType);
	const versionToUse = version ?? pkgVersion;

	// Replace the changeset version with the correct version.
	await replaceInFile(
		`## ${changesetsCalculatedVersion}\n`,
		`## ${versionToUse}\n`,
		`${directory}/CHANGELOG.md`,
	);

	// For changelogs that had no changesets applied to them, add in a 'dependency updates only' section.
	await replaceInFile(
		`## ${versionToUse}\n\n## `,
		`## ${versionToUse}\n\nDependency updates only.\n\n## `,
		`${directory}/CHANGELOG.md`,
	);
}
