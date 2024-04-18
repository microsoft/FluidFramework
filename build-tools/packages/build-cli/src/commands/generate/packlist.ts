/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import type { Package } from "@fluidframework/build-tools";
import Arborist from "@npmcli/arborist";
import { Flags } from "@oclif/core";
import { writeFile } from "fs-extra";
import packlist from "npm-packlist";
import { PackageCommand } from "../../BasePackageCommand";

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

	protected async processPackage(pkg: Package): Promise<void> {
		const { out } = this.flags;

		const outFile = path.join(pkg.directory, out);
		const arborist = new Arborist({ path: pkg.directory });
		const tree = await arborist.loadActual();
		const files = await packlist(tree);

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
