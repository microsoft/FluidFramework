/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Package } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";
import {
	DEFAULT_GENERATION_DIR,
	DEFAULT_GENERATION_FILE_NAME,
	DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
	checkPackageCompatLayerGeneration,
	// eslint-disable-next-line import/no-internal-modules
} from "../../library/layerCompatGeneration.js";

export default class CheckCompatLayerGenerationCommand extends PackageCommand<
	typeof CheckCompatLayerGenerationCommand
> {
	static readonly description =
		"Checks if any packages need new compat layer generation metadata. The check is lenient - packages missing expected metadata or generated files are skipped.";

	static readonly flags = {
		generationDir: Flags.directory({
			description: "The directory where the generation file is located.",
			default: DEFAULT_GENERATION_DIR,
			exists: false, // Don't require it to exist since we're checking
		}),
		outFile: Flags.string({
			description: "Name of the generation file to check.",
			default: DEFAULT_GENERATION_FILE_NAME,
		}),
		minimumCompatWindowMonths: Flags.integer({
			description:
				"The minimum compatibility window in months that is supported across all Fluid layers.",
			default: DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = "dir" as PackageSelectionDefault;

	private readonly packagesNeedingUpdate: { pkg: Package; reason: string }[] = [];

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
			this.packagesNeedingUpdate.push({
				pkg,
				reason: result.reason,
			});
		}
	}

	public async run(): Promise<void> {
		// Calls processPackage on all selected packages
		await super.run();

		if (this.packagesNeedingUpdate.length > 0) {
			this.error(
				`Some packages need layer generation updates:\n${this.packagesNeedingUpdate
					.map(({ pkg, reason }) => `  - ${pkg.name}: ${reason}`)
					.join("\n")}\n\nRun 'flub generate compatLayerGeneration' to update them.`,
			);
			// this.error() throws, so the code below is unreachable when there are errors
		}

		this.log(
			`Layer generation check passed for ${this.filteredPackages?.length ?? 0} packages.`,
		);
	}
}
