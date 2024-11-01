/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PackageJson } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import type { TsConfigJson } from "type-fest";
import { generateSourceEntrypoints } from "../../library/commands/generateSourceEntrypoints.js";
import { ApiLevel, ApiTag, BaseCommand } from "../../library/index.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import { readPackageJson, readTsConfig } from "../../library/package.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import { type ExportData, mapSourceExportsPath } from "../../library/packageExports.js";
import type { CommandLogger } from "../../logging.js";

/**
 * Generates source entrypoints for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export default class GenerateSourceEntrypointsCommand extends BaseCommand<
	typeof GenerateSourceEntrypointsCommand
> {
	static readonly description =
		`Generates TypeScript source files that roll up APIs into different entrypoint files, defined by the "exports" field in package.json and organized by API tags"`;

	static readonly flags = {
		mainEntrypoint: Flags.file({
			description: "Main entrypoint file containing all untrimmed exports.",
			default: "./src/index.ts",
			exists: true,
		}),
		outDir: Flags.directory({
			description: "Directory to emit entrypoint files.",
			default: "./src/entrypoints",
			exists: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { mainEntrypoint, outDir } = this.flags;

		const packageJson = await readPackageJson();

		const tsConfig = await readTsConfig();

		const outFileSuffix = ".ts";

		const mapSrcQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined> = new Map([
			[`${outDir}${ApiLevel.alpha}${outFileSuffix}`, ApiTag.alpha],
			[`${outDir}${ApiLevel.beta}${outFileSuffix}`, ApiTag.beta],
			[`${outDir}${ApiLevel.public}${outFileSuffix}`, ApiTag.public],
			[`${outDir}${ApiLevel.legacy}${outFileSuffix}`, ApiTag.legacy],
		]);

		const mapSrcApiTagLevelToOutput = getOutputConfiguration(
			packageJson,
			tsConfig,
			mapSrcQueryPathToApiTagLevel,
			this.logger,
		);

		if (mapSrcApiTagLevelToOutput.size === 0) {
			throw new Error(
				`There are no package exports matching requested output entrypoints:\n\t${[
					...mapSrcQueryPathToApiTagLevel.keys(),
				].join("\n\t")}`,
			);
		}

		return generateSourceEntrypoints(mainEntrypoint, mapSrcApiTagLevelToOutput, this.logger);
	}
}

/**
 * Generates mappings based on the provided `package.json` and `tsconfig.json`. It establishes a relationship between source paths
 * and API tag levels, and maps these tags to their corresponding export data.
 *
 * @param packageJson - `package.json` content.
 * @param tsconfig - `tsconfig.json` content.
 * @param mapSrcQueryPathToApiTagLevel - Maps source query paths or regular expressions to their corresponding API tags.
 * @param logger - An optional logger for logging messages or warnings during processing.
 * @returns Map with export data associated with different API tags.
 */
function getOutputConfiguration(
	packageJson: PackageJson,
	tsconfig: TsConfigJson,
	mapSrcQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined>,
	logger?: CommandLogger,
): Map<ApiTag, ExportData> {
	let emitDeclarationOnly: boolean = false;
	if (tsconfig.compilerOptions?.emitDeclarationOnly !== undefined) {
		emitDeclarationOnly = tsconfig.compilerOptions.emitDeclarationOnly;
	}

	const mapSrcApiTagLevelToOutput = mapSourceExportsPath(
		packageJson,
		mapSrcQueryPathToApiTagLevel,
		emitDeclarationOnly,
		logger,
	);

	return mapSrcApiTagLevelToOutput;
}
