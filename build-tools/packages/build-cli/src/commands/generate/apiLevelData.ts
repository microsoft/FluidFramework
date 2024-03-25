/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Flags } from "@oclif/core";
import { readJsonSync, writeJson } from "fs-extra";
import globby from "globby";

import { BaseCommand } from "../../base";
import type { MemberDataRaw } from "../modify/fluid-imports";

export default class GenerateApiLevelData extends BaseCommand<typeof GenerateApiLevelData> {
	static readonly description =
		"Generate a datafile for use with the 'modify fluid-imports' command.";

	static readonly flags = {
		input: Flags.file({
			description: "The api-extractor model JSON file to use as input.",
			exists: true,
			// required: true,
		}),
		glob: Flags.string({
			description: "Use all files matching this glob as input.",
			exactlyOne: ["input", "glob"],
		}),
		output: Flags.file({
			description: "Path to output file.",
			required: true,
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
		const { input, glob, output } = this.flags;
		const rawData: Map<string, MemberDataRaw[]> = new Map();

		const inputFiles =
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			input === undefined
				? await globby([glob!, "!**/node_modules/**"], { absolute: true })
				: [input];

		for (const inFile of inputFiles) {
			const apiExtractorJson = readJsonSync(inFile);
			const pkgName: string = apiExtractorJson.name;

			if (!rawData.has(pkgName)) {
				rawData.set(pkgName, []);
			}
			const members = rawData.get(pkgName);
			for (const item of apiExtractorJson.members[0].members) {
				members?.push({
					name: item.name,
					kind: item.kind.toLowerCase(),
					level: item.releaseTag.toLowerCase(),
				});
			}
		}
		const toWrite = Object.fromEntries(rawData.entries());
		await writeJson(output, toWrite, { spaces: "\t" });
	}
}
