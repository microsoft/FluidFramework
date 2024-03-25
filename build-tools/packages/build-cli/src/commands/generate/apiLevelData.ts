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

	public async run(): Promise<void> {
		const { input, glob, output } = this.flags;
		const rawData: Map<string, MemberDataRaw[]> = new Map();

		const inputFiles =
			input === undefined
				? // glob is guaranteed to be defined if input is undefined, thanks to oclif's flag constraints
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					await globby([glob!, "!**/node_modules/**"], { absolute: true })
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
