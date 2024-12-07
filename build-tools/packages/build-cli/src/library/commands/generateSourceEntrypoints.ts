/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import type { PackageJson } from "@fluidframework/build-tools";
import JSON5 from "json5";
import type { TsConfigJson } from "type-fest";
import type { CommandLogger } from "../../logging.js";
import { ApiLevel, isKnownApiLevel } from "../apiLevel.js";
import type { ApiTag } from "../apiTag.js";
import { type ExportData, getExportPathFromPackage } from "../packageExports.js";

export const optionDefaults = {
	outDir: "src/entrypoints/tsconfig.json",
} as const;

const defaultExportCondition = "default";
const typesExportCondition = "types";

/**
 * Retrieves `rootDir` and `outDir` settings from a `tsconfig.json` file.
 *
 * @param tsconfigPath - Path to the TypeScript config file.
 * @returns An object with `rootDir`, `outDir` values.
 * @throws If `rootDir` and `outDir` is not defined in the config file.
 */
export function getTsConfigCompilerOptions(tsconfigPath: string): {
	rootDir: string;
	tsconfigOutDir: string;
} {
	const tsConfigContent = fs.readFileSync(tsconfigPath, {
		encoding: "utf8",
	});

	if (tsConfigContent === undefined) {
		throw new Error(`tsconfig.json not found in ${tsconfigPath}`);
	}

	const tsconfig: TsConfigJson = JSON5.parse(tsConfigContent);

	const { compilerOptions } = tsconfig;

	if (compilerOptions === undefined) {
		throw new Error(`No compilerOptions defined in ${tsconfigPath}`);
	}

	const { rootDir, outDir } = compilerOptions;

	if (rootDir === undefined) {
		throw new Error(`No rootDir defined in ${tsconfigPath}`);
	}

	if (outDir === undefined) {
		throw new Error(`No outDir defined in ${tsconfigPath}`);
	}

	return {
		rootDir,
		tsconfigOutDir: outDir,
	};
}

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
			isTypeOnly: resolvedExport?.includes(".d.ts") === true,
		});
	}

	return mapKeyToOutput;
}

/**
 * Normalizes a relative path by removing parent directory (`..`) references
 */
function normalizePath(dir: string): string {
	const parts = dir.split("/").filter((part) => part !== ".." && part !== "");
	return `/${parts.join("/")}`;
}

/**
 * Resolves a mapping of `ApiTag` levels to their modified export paths.
 */
export function getOutputConfiguration(
	packageJson: PackageJson,
	options: Readonly<Record<keyof typeof optionDefaults, string>>,
	logger?: CommandLogger,
): Map<ApiTag, ExportData> {
	const mapApiTagToExportPath: Map<ApiTag, ExportData> = mapExportPathToApiTag(
		packageJson,
		logger,
	);

	const { rootDir, tsconfigOutDir } = getTsConfigCompilerOptions(options.outDir);

	const result = new Map<ApiTag, ExportData>();
	for (const [apiTag, exportData] of mapApiTagToExportPath) {
		const modifiedExportPath = exportData.relPath
			.replace(normalizePath(tsconfigOutDir), normalizePath(rootDir))
			.replace(/\.js$|\.d\.ts$/, ".ts");

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
function readArgValues<TQuery extends Readonly<Record<string, string>>>(
	commandLine: string,
	argQuery: TQuery,
): TQuery {
	const values: Record<string, string> = {};
	const args = commandLine.split(" ");
	for (const [argName, defaultValue] of Object.entries(argQuery)) {
		const indexOfArgValue = args.indexOf(`--${argName}`) + 1;
		values[argName] =
			0 < indexOfArgValue && indexOfArgValue < args.length
				? args[indexOfArgValue]
				: defaultValue;
	}
	return values as TQuery;
}

export function getGenerateSourceEntrypointsOutput(
	packageJson: PackageJson,
	commandLine: string,
): IterableIterator<ExportData> {
	const args = readArgValues(commandLine, optionDefaults);

	const mapSourceToExportPath: Map<ApiTag, ExportData> = getOutputConfiguration(
		packageJson,
		args,
	);

	return mapSourceToExportPath.values();
}
