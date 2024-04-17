/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Arborist from "@npmcli/arborist";
import { Flags } from "@oclif/core";
import { writeFile } from "fs-extra";
import packlist from "npm-packlist";

import { BaseCommand } from "../../base";

/**
 * Outputs a list of files that will be included in a package based on its 'files' property in package.json and any
 * npmignore files.
 */
export default class GeneratePackListCommand extends BaseCommand<
	typeof GeneratePackListCommand
> {
	static readonly description =
		"Outputs a list of files that will be included in a package based on its 'files' property in package.json and any .npmignore files.";

	static readonly flags = {
		packagePath: Flags.directory({
			description: "Path to a folder containing a package.",
			default: ".",
		}),
		out: Flags.file({
			description: "File to output the pack list to.",
			default: "packlist.txt",
			exists: false,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { packagePath, out: outFile } = this.flags;

		const arborist = new Arborist({ path: packagePath });
		const tree = await arborist.loadActual();
		const files = await packlist(tree);

		// Sort root files first, then sort nested paths from least nested to most nested.
		files.sort((a, b) => {
			const dirCountA = a.match(/\//)?.length ?? 0;
			const dirCountB = b.match(/\//)?.length ?? 0;

			// const rootFile = dirCountA === dirCountB && dirCountA === 0;
			const hasDir = dirCountA > 0 || dirCountB > 0;

			if (hasDir) {
				if (dirCountA > dirCountB) {
					return 1;
				}
				if (dirCountA < dirCountB) {
					return -1;
				}
			}

			if (a < b) {
				return -1;
			}

			if (a > b) {
				return 1;
			}

			return 0;
		});

		const output = files.join("\n");
		await writeFile(outFile, output);
	}
}
