/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, FluidRepo } from "@fluidframework/build-tools";
import { fromInternalScheme, isInternalVersionScheme } from "@fluid-tools/version-tools";
import { Flags } from "@oclif/core";
import { command as execCommand } from "execa";
import { readFile, writeFile } from "node:fs/promises";
import { inc } from "semver";
import { CleanOptions } from "simple-git";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";
import { Repository } from "../../library";
import { isReleaseGroup } from "../../releaseGroups";

async function replaceInFile(search: string, replace: string, path: string): Promise<void> {
	const content = await readFile(path, "utf8");
	const newContent = content.replace(new RegExp(search, "g"), replace);
	await writeFile(path, newContent, "utf8");
}

export default class GenerateApiLevelData extends BaseCommand<typeof GenerateApiLevelData> {
	static readonly description =
		"Generate a datafile for use with the 'modify fluid-imports' command.";

	static readonly flags = {
		input: Flags.file({
			description:
				"The api-extractor model JSON file to use as input.",
			exists: true,
		}),
		output: Flags.file({
			description:
				"Path to output file.",
		}),
		...BaseCommand.flags,
	} as const;

	// static readonly examples = [
	// 	{
	// 		description: "Generate changelogs for the client release group.",
	// 		command: "<%= config.bin %> <%= command.id %> --releaseGroup client",
	// 	},
	// ];

	// private repo?: Repository;

	// private async processPackage(pkg: Package): Promise<void> {
	// 	const { directory, version: pkgVersion } = pkg;

	// 	// This is the version that the changesets tooling calculates by default. It does a semver major bump on the current
	// 	// version. We search for that version in the generated changelog and replace it with the one that we want.
	// 	// For internal versions, bumping the semver major is the same as just taking the public version from the internal
	// 	// version and using it directly.
	// 	const changesetsCalculatedVersion = isInternalVersionScheme(pkgVersion)
	// 		? fromInternalScheme(pkgVersion)[0].version
	// 		: inc(pkgVersion, "major");
	// 	const versionToUse = this.flags.version ?? pkgVersion;

	// 	// Replace the changeset version with the correct version.
	// 	await replaceInFile(
	// 		`## ${changesetsCalculatedVersion}\n`,
	// 		`## ${versionToUse}\n`,
	// 		`${directory}/CHANGELOG.md`,
	// 	);

	// 	// For changelogs that had no changesets applied to them, add in a 'dependency updates only' section.
	// 	await replaceInFile(
	// 		`## ${versionToUse}\n\n## `,
	// 		`## ${versionToUse}\n\nDependency updates only.\n\n## `,
	// 		`${directory}/CHANGELOG.md`,
	// 	);
	// }

	public async run(): Promise<void> {
		const {input, output} = this.flags;

		

	}
}
