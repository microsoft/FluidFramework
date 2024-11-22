/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PackageJson } from "@fluidframework/build-tools";
import type { CommandLogger } from "../../logging.js";
import { ApiLevel, isKnownApiLevel } from "../apiLevel.js";
import type { ApiTag } from "../apiTag.js";
import { type ExportData, getExportPathFromPackage } from "../packageExports.js";

const defaultExportCondition = "default";
const typesExportCondition = "types";

/**
 * Read package "exports" to determine which "default"/ "types" paths to return along with `ApiTag`.
 *
 * @param packageJson - json content of package.json
 * @param logger - optional Logger
 * @returns Map with API tags or levels with export path data
 */
function mapExportPathToApiTag(
	packageJson: PackageJson,
	logger?: CommandLogger,
): Map<ApiTag, ExportData> {
	const mapKeyToOutput = new Map<ApiTag, ExportData>();

	const { exports } = packageJson;

	if (typeof exports !== "object" || exports === null || exports === undefined) {
		throw new Error(`${packageJson.name}: No exports map found.`);
	}

	for (const [exportPath] of Object.entries(exports)) {
		const level = exportPath === "." ? ApiLevel.public : exportPath.replace("./", "");
		const isTypeOnly = false; // TODO: fix this
		const conditions = [defaultExportCondition, typesExportCondition];

		if (!isKnownApiLevel(level)) {
			throw new Error(`${exportPath} is not a known API tag`);
		}

		if (level === ApiLevel.internal) {
			continue;
		}

		const resolvedExport = getExportPathFromPackage(packageJson, level, conditions, logger);

		if (resolvedExport === undefined) {
			throw new Error(`${packageJson.name}: No export map found.`);
		}

		mapKeyToOutput.set(level, {
			relPath: resolvedExport,
			conditions: [],
			isTypeOnly,
		});
	}

	console.log(mapKeyToOutput);

	return mapKeyToOutput;
}

/**
 * Resolves a mapping of `ApiTag` levels to their modified export paths.
 */
export function getOutputConfiguration(
	packageJson: PackageJson,
	rootDir: string,
	tsconfigOutDir: string,
	logger?: CommandLogger,
): Map<ApiTag, ExportData> {
	const mapApiTagToExportPath: Map<ApiTag, ExportData> = mapExportPathToApiTag(
		packageJson,
		logger,
	);

	const result = new Map<ApiTag, ExportData>();
	for (const [apiTag, exportData] of mapApiTagToExportPath) {
		const modifiedExportPath = exportData.relPath
			.replace(tsconfigOutDir, rootDir)
			.replace(/\.js$|\.d\.ts$/, ".ts");

		if (modifiedExportPath === exportData.relPath) {
			throw new Error(`Failed to replace ${tsconfigOutDir} with ${rootDir}.`);
		}

		if (result.has(apiTag)) {
			logger?.warning(`${modifiedExportPath} found in exports multiple times.`);
		}
		result.set(apiTag, { ...exportData, relPath: modifiedExportPath });
	}

	return result;
}

/**
 * Reads command line argument values that are simple value following option like:
 * --optionName value
 *
 * @param commandLine - command line to extract from
 * @param argQuery - record of arguments to read (keys) with default values
 * @returns record of argument values extracted or given default value
 */
// function readArgValues<TQuery extends Readonly<Record<string, string>>>(
// 	commandLine: string,
// 	argQuery: string,
// ): TQuery {
// 	const values: Record<string, string> = {};
// 	const args = commandLine.split(" ");
// 	for (const [argName, defaultValue] of Object.entries(argQuery)) {
// 		const indexOfArgValue = args.indexOf(`--${argName}`) + 1;
// 		values[argName] =
// 			0 < indexOfArgValue && indexOfArgValue < args.length
// 				? args[indexOfArgValue]
// 				: defaultValue;
// 	}
// 	return values as TQuery;
// }

// export function getGenerateSourceEntrypointsOutput(
// 	packageJson: PackageJson,
// 	commandLine: string,
// ): IterableIterator<ExportData> {
// 	const outDirIndex = process.argv.indexOf("--outDir");
// 	const outDir = process.argv[outDirIndex + 1] ?? "./src/entrypoints/";

// 	const args = readArgValues(commandLine, outDir);

// 	const mapSourceToExportPath: Map<ApiTag, ExportData> = getOutputConfiguration(
// 		packageJson,
// 		args.rootDir,
// 		args.tsconfigOutDir,
// 	);

// 	return mapSourceToExportPath.values();
// }

export function getGenerateSourceEntrypointsTscOutput(
	packageJson: PackageJson,
	rootDir: string,
	outDir: string,
): IterableIterator<ExportData> {
	const mapSourceToExportPath: Map<ApiTag, ExportData> = getOutputConfiguration(
		packageJson,
		rootDir,
		outDir,
	);

	return mapSourceToExportPath.values();
}
