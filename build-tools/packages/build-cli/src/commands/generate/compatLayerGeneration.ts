/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { updatePackageJsonFile } from "@fluid-tools/build-infrastructure";
import type {
	IFluidCompatibilityMetadata,
	Package,
	PackageJson,
} from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { formatISO } from "date-fns";
import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";
import {
	DEFAULT_GENERATION_DIR,
	DEFAULT_GENERATION_FILE_NAME,
	DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
	checkPackageCompatLayerGeneration,
	generateLayerFileContent,
	maybeGetNewGeneration,
	// eslint-disable-next-line import/no-internal-modules
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
		const generationFileFullPath = path.join(pkg.directory, generationDir, outFile);

		// Use the shared check logic to determine if update is needed
		// This eliminates duplicate opt-in and patch version checks
		const checkResult = await checkPackageCompatLayerGeneration(
			pkg,
			generationDir,
			outFile,
			minimumCompatWindowMonths,
			this.logger,
		);

		if (!checkResult.needsUpdate) {
			// No update needed; early exit.
			this.verbose(`No generation update needed; skipping.`);
			return;
		}

		const currentPkgVersion = pkg.version;
		const { fluidCompatMetadata } = pkg.packageJson;

		// At this point we know fluidCompatMetadata exists because checkPackageCompatLayerGeneration
		// would have returned needsUpdate: false otherwise
		if (fluidCompatMetadata === undefined) {
			// This should not happen since the check said we need an update
			this.warning(
				`Unexpected: check said update needed but fluidCompatMetadata is undefined`,
			);
			return;
		}

		const newGeneration = maybeGetNewGeneration(
			currentPkgVersion,
			fluidCompatMetadata,
			minimumCompatWindowMonths,
			this.logger,
		);

		// This should not be undefined since checkPackageCompatLayerGeneration said we need an update
		if (newGeneration === undefined) {
			this.warning(
				`Unexpected: check said update needed but maybeGetNewGeneration returned undefined`,
			);
			return;
		}

		const currentReleaseDate = formatISO(new Date(), { representation: "date" });
		const newFluidCompatMetadata: IFluidCompatibilityMetadata = {
			generation: newGeneration,
			releaseDate: currentReleaseDate,
			releasePkgVersion: currentPkgVersion,
		};
		updatePackageJsonFile(pkg.directory, (json: PackageJson) => {
			json.fluidCompatMetadata = newFluidCompatMetadata;
		});
		await writeFile(generationFileFullPath, generateLayerFileContent(newGeneration), {
			encoding: "utf8",
		});
		this.info(`Layer generation updated to ${newGeneration}`);
	}
}
