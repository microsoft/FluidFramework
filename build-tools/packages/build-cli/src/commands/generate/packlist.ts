/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Package } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import execa from "execa";
import { PackageCommand } from "../../BasePackageCommand.js";

/**
 * JSON results from running npm pack --json.
 */
interface NpmPackJson {
	id: string;
	name: string;
	version: string;
	size: number;
	unpackedSize: number;
	shasum: string;
	integrity: string;
	filename: string;
	files: {
		path: string;
		size: number;
		mode: number;
	}[];
	entryCount: number;
	bundled: unknown[];
}

/**
 * Outputs a list of files that will be included in a package based on its 'files' property in package.json and any
 * npmignore files.
 */
export default class GeneratePackListCommand extends PackageCommand<
	typeof GeneratePackListCommand
> {
	static readonly description =
		"Outputs a list of files that will be included in a package based on its 'files' property in package.json and any .npmignore files.";

	static readonly flags = {
		out: Flags.file({
			description:
				"File to output the pack list to. This path is relative to the package whose contents is being listed.",
			default: "packlist.txt",
			exists: false,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = undefined;

	protected async processPackage(pkg: Package): Promise<void> {
		const { out } = this.flags;

		const outFile = path.join(pkg.directory, out);
		const packOutput = await execa(
			"npm",
			["pack", "--dry-run", "--json", "--ignore-scripts"],
			{
				cwd: pkg.directory,
			},
		);
		if (packOutput.stdout === undefined) {
			this.error(`npm pack had no output.`, { exit: 1 });
		}

		// The npm pack JSON is an array, so treat it as such and extract the first item.
		const raw = JSON.parse(packOutput.stdout.trim()) as NpmPackJson[];
		const files = raw[0].files.map((entry) => entry.path);

		// Sort root files first, then sort nested paths.
		files.sort((a, b) => {
			const dirCountA = a.match(/\//)?.length ?? 0;
			const dirCountB = b.match(/\//)?.length ?? 0;

			if (dirCountA < dirCountB) {
				return -1;
			}
			if (dirCountA > dirCountB) {
				return 1;
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
