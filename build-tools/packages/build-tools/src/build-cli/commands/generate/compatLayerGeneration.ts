/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import type { Package } from "../../../core/index.js";
import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";
import {
	checkPackageCompatLayerGeneration,
	DEFAULT_GENERATION_DIR,
	DEFAULT_GENERATION_FILE_NAME,
	DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
	deleteCompatLayerGenerationFile,
	writePackageCompatLayerGeneration,
} from "../../library/compatLayerGeneration.js";

/**
 * Command to update the generation value of Fluid's compatibility layers.
 */
export default class UpdateGenerationLayerCommand extends PackageCommand<
	typeof UpdateGenerationLayerCommand
> {
	static readonly description =
		`Updates the generation of a package for layer compatibility.` +
		` To opt in a package, add an empty "fluidCompatMetadata" object to its package.json.`;

	static readonly flags = {
		generationDir: Flags.directory({
			description: "The directory where the generation file is located.",
			default: DEFAULT_GENERATION_DIR,
			exists: true,
		}),
		outFile: Flags.string({
			description: `Output the results to this file.`,
			default: DEFAULT_GENERATION_FILE_NAME,
		}),
		minimumCompatWindowMonths: Flags.integer({
			description: `The minimum compatibility window in months that is supported across all Fluid layers. Must be at least 1`,
			default: DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			min: 1,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = "dir" as PackageSelectionDefault;

	protected async processPackage(pkg: Package): Promise<void> {
		const { generationDir, outFile, minimumCompatWindowMonths } = this.flags;

		const result = await checkPackageCompatLayerGeneration(
			pkg,
			generationDir,
			outFile,
			minimumCompatWindowMonths,
			this.logger,
		);

		if (result.needsUpdate) {
			await writePackageCompatLayerGeneration(
				pkg,
				result.newGeneration,
				generationDir,
				outFile,
			);
			this.info(`Layer generation updated to ${result.newGeneration}`);
		} else if (result.needsDeletion) {
			await deleteCompatLayerGenerationFile(result.filePath);
			this.info(`Deleted orphaned generation file: ${result.filePath}`);
		} else {
			this.verbose(`No update needed for ${pkg.name}`);
		}
	}
}
