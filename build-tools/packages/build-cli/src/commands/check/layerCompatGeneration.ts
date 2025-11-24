/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Package } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";
import {
	generateLayerFileContent,
	isCurrentPackageVersionPatch,
	maybeGetNewGeneration,
} from "../generate/layerCompatGeneration.js";

export default class CheckLayerCompatGenerationCommand extends PackageCommand<
	typeof CheckLayerCompatGenerationCommand
> {
	static readonly description =
		"Checks if any packages need new layer generation metadata. The check is lenient - packages missing expected metadata or generated files are skipped.";

	static readonly flags = {
		generationDir: Flags.directory({
			description: "The directory where the generation file is located.",
			default: "./src",
			exists: false, // Don't require it to exist since we're checking
		}),
		outFile: Flags.string({
			description: "Name of the generation file to check.",
			default: "layerGenerationState.ts",
		}),
		minimumCompatWindowMonths: Flags.integer({
			description:
				"The minimum compatibility window in months that is supported across all Fluid layers.",
			default: 3,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = "dir" as PackageSelectionDefault;

	private readonly packagesNeedingUpdate: { pkg: Package; reason: string }[] = [];

	protected async processPackage(pkg: Package): Promise<void> {
		const { generationDir, outFile, minimumCompatWindowMonths } = this.flags;
		const generationFileFullPath = path.join(pkg.directory, generationDir, outFile);

		const currentPkgVersion = pkg.version;

		// Skip patch versions (they don't trigger generation updates)
		if (isCurrentPackageVersionPatch(currentPkgVersion)) {
			this.verbose(`${pkg.name}: Patch version detected; skipping check.`);
			return;
		}

		// Check if package has the required metadata
		const { fluidCompatMetadata } = pkg.packageJson;
		if (fluidCompatMetadata === undefined) {
			this.verbose(
				`${pkg.name}: No fluidCompatMetadata found in package.json; skipping (lenient check).`,
			);
			return;
		}

		this.verbose(
			`${pkg.name}: Checking generation metadata - Generation: ${fluidCompatMetadata.generation}, ` +
				`Release Date: ${fluidCompatMetadata.releaseDate}, Package Version: ${fluidCompatMetadata.releasePkgVersion}`,
		);

		// Check if the generation file exists
		let fileContent: string;
		try {
			fileContent = await readFile(generationFileFullPath, "utf8");
		} catch {
			this.verbose(
				`${pkg.name}: Generation file not found at ${generationFileFullPath}; skipping (lenient check).`,
			);
			return;
		}

		// Check if a new generation should be created based on version/time
		const newGeneration = maybeGetNewGeneration(
			currentPkgVersion,
			fluidCompatMetadata,
			minimumCompatWindowMonths,
			this.logger,
		);

		if (newGeneration !== undefined) {
			this.packagesNeedingUpdate.push({
				pkg,
				reason: `Generation should be updated from ${fluidCompatMetadata.generation} to ${newGeneration}`,
			});
			return;
		}

		// Verify the file content matches the expected generation
		const expectedContent = generateLayerFileContent(fluidCompatMetadata.generation);
		if (fileContent !== expectedContent) {
			this.packagesNeedingUpdate.push({
				pkg,
				reason: `Generation file content does not match expected content for generation ${fluidCompatMetadata.generation}`,
			});
			return;
		}

		this.verbose(`${pkg.name}: Layer generation metadata is up to date.`);
	}

	public async run(): Promise<void> {
		// Calls processPackage on all selected packages
		await super.run();

		if (this.packagesNeedingUpdate.length > 0) {
			this.error(
				`Some packages need layer generation updates:\n${this.packagesNeedingUpdate
					.map(({ pkg, reason }) => `  - ${pkg.name}: ${reason}`)
					.join("\n")}\n\nRun 'flub generate layerCompatGeneration' to update them.`,
			);
		}

		this.log(
			`Layer generation check passed for ${this.filteredPackages?.length ?? 0} packages.`,
		);
	}
}
