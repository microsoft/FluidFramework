/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { rm } from "node:fs/promises";
import type { Package } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";
import {
	generateEntrypoints,
	generateNode10TypeEntrypoints,
	getOutputConfiguration,
	optionDefaults,
} from "../../library/commands/generateEntrypoints.js";
import { ApiLevel, unscopedPackageNameString } from "../../library/index.js";

// export default class GenerateEntrypointsCommand_ extends GenerateEntrypointsCommand {}

/**
 * Generates type declarations files for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export default class GenerateEntrypointsCommand extends PackageCommand<
	typeof GenerateEntrypointsCommand
> {
	static readonly description =
		`Generates type declaration entrypoints for Fluid Framework API levels (/alpha, /beta. etc.) as found in package.json "exports"`;

	static readonly flags = {
		mainEntrypoint: Flags.file({
			description: "Main entrypoint file containing all untrimmed exports.",
			default: optionDefaults.mainEntrypoint,
			exists: true,
		}),
		outDir: Flags.directory({
			description: "Directory to emit entrypoint declaration files.",
			default: optionDefaults.outDir,
			exists: true,
		}),
		outFilePrefix: Flags.string({
			description: `File name prefix for emitting entrypoint declaration files. Pattern of '${unscopedPackageNameString}' within value will be replaced with the unscoped name of this package.`,
			default: optionDefaults.outFilePrefix,
		}),
		outFileAlpha: Flags.string({
			description: "Base file name for alpha entrypoint declaration files.",
			default: optionDefaults.outFileAlpha,
		}),
		outFileBeta: Flags.string({
			description: "Base file name for beta entrypoint declaration files.",
			default: optionDefaults.outFileBeta,
		}),
		outFileLegacy: Flags.string({
			description: "Base file name for legacy entrypoint declaration files.",
			default: optionDefaults.outFileLegacy,
		}),
		outFilePublic: Flags.string({
			description: "Base file name for public entrypoint declaration files.",
			default: optionDefaults.outFilePublic,
		}),
		outFileSuffix: Flags.string({
			description:
				"File name suffix including extension for emitting entrypoint declaration files.",
			default: optionDefaults.outFileSuffix,
		}),
		node10TypeCompat: Flags.boolean({
			description: `Optional generation of Node10 resolution compatible type entrypoints matching others.`,
		}),
		...PackageCommand.flags,
	};

	protected defaultSelection = "dir" as PackageSelectionDefault;

	protected async processPackage(pkg: Package): Promise<void> {
		const { mainEntrypoint, node10TypeCompat } = this.flags;
		const { packageJson } = pkg;

		const {
			mapQueryPathToApiTagLevel,
			mapApiTagLevelToOutput,
			mapNode10CompatExportPathToData,
		} = getOutputConfiguration(this.flags, packageJson, this.logger);

		const promises: Promise<void>[] = [];

		// Requested specific outputs that are not in the output map are explicitly
		// removed for clean incremental build support.
		for (const [outputPath, apiLevel] of mapQueryPathToApiTagLevel.entries()) {
			if (
				apiLevel !== undefined &&
				typeof outputPath === "string" &&
				!mapApiTagLevelToOutput.has(apiLevel)
			) {
				promises.push(rm(outputPath, { force: true }));
			}
		}

		if (node10TypeCompat && mapNode10CompatExportPathToData.size === 0) {
			throw new Error(
				'There are no API level "exports" requiring Node10 type compatibility generation.',
			);
		}

		if (mapApiTagLevelToOutput.size === 0) {
			throw new Error(
				`There are no package exports matching requested output entrypoints:\n\t${[
					...mapQueryPathToApiTagLevel.keys(),
				].join("\n\t")}`,
			);
		}

		// In the past @alpha APIs could be mapped to /legacy via --outFileAlpha.
		// When @alpha is mapped to /legacy, @beta should not be included in
		// @alpha aka /legacy entrypoint.
		const separateBetaFromAlpha = this.flags.outFileAlpha !== ApiLevel.alpha;
		promises.push(
			generateEntrypoints(
				mainEntrypoint,
				mapApiTagLevelToOutput,
				this.logger,
				separateBetaFromAlpha,
			),
		);

		if (node10TypeCompat) {
			promises.push(
				generateNode10TypeEntrypoints(mapNode10CompatExportPathToData, this.logger),
			);
		}

		// All of the output actions (deletes of stale files or writing of new/updated files)
		// are all independent and can be done in parallel.
		await Promise.all(promises);
	}
}
