/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generateNode10TypeEntrypoints } from "../../library/commands/generateEntrypoints.js";
import { BaseCommand } from "../../library/commands/base.js";
import { readPackageJson } from "../../library/package.js";
import { queryTypesResolutionPathsFromPackageExports } from "../../library/packageExports.js";

export default class GenerateNode10EntrypointsCommand extends BaseCommand<
	typeof GenerateNode10EntrypointsCommand
> {
	static readonly description =
		`Generates node10 type declaration entrypoints for Fluid Framework API levels (/alpha, /beta, /internal etc.) as found in package.json "exports"`;

	public async run(): Promise<void> {
		const packageJson = await readPackageJson();

		const { mapNode10CompatExportPathToData } = queryTypesResolutionPathsFromPackageExports(
			packageJson,
			new Map([[/.+/, undefined]]),
			{
				// Request `mapNode10CompatExportPathToData` output to be populated.
				node10TypeCompat: true,
				// Only consider the first match per export path.
				onlyFirstMatches: true,
			},
			this.logger,
		);

		if (mapNode10CompatExportPathToData.size === 0) {
			throw new Error(
				'There are no API level "exports" requiring Node10 type compatibility generation.',
			);
		}

		const commandLine = `flub generate node10Entrypoints${this.commandLineArgs()}`;
		await generateNode10TypeEntrypoints(
			mapNode10CompatExportPathToData,
			commandLine,
			this.logger,
		);
	}
}
