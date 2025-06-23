import { readFile, writeFile } from "node:fs/promises";
import type { IPackage } from "@fluid-tools/build-infrastructure";
import {
	type VersionBumpType,
	bumpVersionScheme,
	isInternalVersionScheme,
} from "@fluid-tools/version-tools";
import { inc } from "semver";

async function replaceInFile(
	search: string,
	replace: string,
	filePath: string,
): Promise<void> {
	const content = await readFile(filePath, "utf8");
	const newContent = content.replace(new RegExp(search, "g"), replace);
	await writeFile(filePath, newContent, "utf8");
}

export async function updateChangelogs(
	pkg: IPackage,
	bumpType: VersionBumpType,
	version?: string,
): Promise<void> {
	if (pkg.isReleaseGroupRoot) {
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
