/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs/promises";
import JSON5 from "json5";

import type { PackageJson } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import type { TsConfigJson } from "type-fest";
import {
	generateSourceEntrypoints,
	optionDefaults,
	readPackageJson,
} from "../../library/commands/generateSourceEntrypoints.js";
import { ApiTag, BaseCommand } from "../../library/index.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import { type ExportData, mapExportPathsFromPackage } from "../../library/packageExports.js";
import type { CommandLogger } from "../../logging.js";

/**
 * Generates source entrypoints for Fluid Framework APIs to support API levels (/alpha, /beta. etc.).
 */
export default class GenerateSourceEntrypointsCommand extends BaseCommand<
	typeof GenerateSourceEntrypointsCommand
> {
	static readonly description =
		`Generates TypeScript source files that roll up APIs into different entrypoint files. The entrypoints are determined based on the "exports" field in package.json."`;

	static readonly flags = {
		mainEntrypoint: Flags.file({
			description: "Main entrypoint file containing all untrimmed exports.",
			default: optionDefaults.mainEntrypoint,
			exists: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const { mainEntrypoint } = this.flags;

		const packageJson = await readPackageJson();

		const tsConfig = await readTsConfig();

		const { outFileSuffix, outFileAlpha, outFileBeta, outFileLegacy, outFilePublic, outDir } =
			optionDefaults;

		const mapSrcQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined> = new Map([
			[`${outDir}${outFileAlpha}${outFileSuffix}`, ApiTag.alpha],
			[`${outDir}${outFileBeta}${outFileSuffix}`, ApiTag.beta],
			[`${outDir}${outFilePublic}${outFileSuffix}`, ApiTag.public],
			[`${outDir}${outFileLegacy}${outFileSuffix}`, ApiTag.legacy],
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

		const promises: Promise<void>[] = [];
		promises.push(
			generateSourceEntrypoints(mainEntrypoint, mapSrcApiTagLevelToOutput, this.logger),
		);

		// All of the output actions (deletes of stale files or writing of new/updated files)
		// are all independent and can be done in parallel.
		await Promise.all(promises);
	}
}

// Reads and parses the `tsconfig.json` file in the current directory.
async function readTsConfig(): Promise<TsConfigJson> {
	const tsConfigContent = await fs.readFile("./tsconfig.json", { encoding: "utf8" });
	return JSON5.parse(tsConfigContent);
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

	const mapSrcApiTagLevelToOutput = mapExportPathsFromPackage(
		packageJson,
		mapSrcQueryPathToApiTagLevel,
		emitDeclarationOnly,
		logger,
	);

	return mapSrcApiTagLevelToOutput;
}
