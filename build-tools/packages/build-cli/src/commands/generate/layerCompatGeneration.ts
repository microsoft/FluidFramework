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
	generateLayerFileContent,
	isCurrentPackageVersionPatch,
	maybeGetNewGeneration,
	// eslint-disable-next-line import/no-internal-modules
} from "../../library/layerCompatGeneration.js";

export default class UpdateGenerationCommand extends PackageCommand<
	typeof UpdateGenerationCommand
> {
	static readonly description =
		"Updates the generation and release date for layer compatibility.";

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
			description: `The minimum compatibility window in months that is supported across all Fluid layers.`,
			default: DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = "dir" as PackageSelectionDefault;

	protected async processPackage(pkg: Package): Promise<void> {
		const { generationDir, outFile, minimumCompatWindowMonths } = this.flags;
		const generationFileFullPath = path.join(pkg.directory, generationDir, outFile);

		const currentPkgVersion = pkg.version;
		// "patch" versions do trigger generation updates.
		if (isCurrentPackageVersionPatch(currentPkgVersion)) {
			this.verbose(`Patch version detected; skipping generation update.`);
			return;
		}

		// Default to generation 1 if no existing file.
		let newGeneration: number | undefined = 1;
		const { fluidCompatMetadata } = pkg.packageJson;
		if (fluidCompatMetadata !== undefined) {
			this.verbose(
				`Layer compatibility metadata from package.json: Generation: ${fluidCompatMetadata.generation}, ` +
					`Release Date: ${fluidCompatMetadata.releaseDate}, Package Version: ${fluidCompatMetadata.releasePkgVersion}`,
			);
			newGeneration = maybeGetNewGeneration(
				currentPkgVersion,
				fluidCompatMetadata,
				minimumCompatWindowMonths,
				this.logger,
			);
			if (newGeneration === undefined) {
				// No update needed; early exit.
				this.verbose(`No generation update needed; skipping.`);
				return;
			}
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
