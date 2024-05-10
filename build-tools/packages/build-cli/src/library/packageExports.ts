/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { Logger, PackageJson } from "@fluidframework/build-tools";

import { ApiTag } from "./apiTag";

/**
 * Properties for an "exports" leaf entry block in package.json.
 * A block is the set of conditions and final results as in:
 * ```json
 * {
 *    "types": "./index.d.ts",
 *    "default": "./index.js"
 * }
 * ```
 */
export interface ExportData {
	/**
	 * Location of file relative to package
	 */
	relPath: string;
	/**
	 * Conditions required for export access; in hierarchy order
	 */
	conditions: string[];
	/**
	 * Export is only .d.ts file
	 */
	isTypeOnly: boolean;
}
/**
 * Minimal set of properties required from an "exports" entry to generate
 * Node10 compatible redirection files.
 */
export type Node10CompatExportData = Pick<ExportData, "relPath" | "isTypeOnly">;

/**
 * Only the value types of exports that are records.
 */
type ExportsRecordValue = Exclude<Extract<PackageJson["exports"], object>, unknown[]>;

function findTypesPathMatching(
	mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined>,
	exports: ExportsRecordValue,
	conditions: string[],
): (ExportData & { apiTagLevel: ApiTag | undefined }) | undefined {
	for (const [entry, value] of Object.entries(exports)) {
		if (typeof value === "string") {
			if (entry === "types") {
				for (const [key, apiTagLevel] of mapQueryPathToApiTagLevel.entries()) {
					// eslint-disable-next-line max-depth
					if (
						typeof key === "string"
							? path.resolve(value) === path.resolve(key)
							: key.test(value)
					) {
						const isTypeOnly = !(
							"default" in exports ||
							"import" in exports ||
							"require" in exports
						);
						return { apiTagLevel, relPath: value, conditions, isTypeOnly };
					}
				}
			}
		} else if (value !== null) {
			if (Array.isArray(value)) {
				continue;
			}
			const deepFind = findTypesPathMatching(mapQueryPathToApiTagLevel, value, [
				...conditions,
				entry,
			]);
			if (deepFind !== undefined) {
				return deepFind;
			}
		}
	}

	return undefined;
}

/**
 * Read package "exports" to determine which of given file paths are present.
 *
 * @param packageJson - json content of package.json
 * @param mapQueryPathToApiTagLevel - keys of map represent paths to match. When matched
 * value, if defined, is used to set entry key in output mapApiTagLevelToOutput.
 * @param node10TypeCompat - when true, populates output mapNode10CompatExportPathToData.
 * @param logger - optional Logger
 * @returns object with mapApiTagLevelToOutput, map of ApiTags to output paths, and
 * mapNode10CompatExportPathToData, map of compat file path to Node16 path.
 */
export function queryOutputMapsFromPackageExports(
	packageJson: PackageJson,
	mapQueryPathToApiTagLevel: Map<string | RegExp, ApiTag | undefined>,
	node10TypeCompat: boolean,
	logger?: Logger,
): {
	mapApiTagLevelToOutput: Map<ApiTag, ExportData>;
	mapNode10CompatExportPathToData: Map<string, Node10CompatExportData>;
} {
	const mapApiTagLevelToOutput = new Map<ApiTag, ExportData>();
	const mapNode10CompatExportPathToData = new Map<string, Node10CompatExportData>();

	const { exports } = packageJson;
	if (typeof exports !== "object" || exports === null) {
		throw new Error('no valid "exports" within package properties');
	}

	if (Array.isArray(exports)) {
		// eslint-disable-next-line unicorn/prefer-type-error
		throw new Error(`required entrypoints cannot be generated for "exports" array`);
	}

	// Iterate through exports looking for properties with values matching keys in map.
	for (const [exportPath, exportValue] of Object.entries(exports)) {
		if (typeof exportValue !== "object") {
			logger?.verbose(`ignoring non-object export path "${exportPath}": "${exportValue}"`);
			continue;
		}
		if (exportValue === null) {
			logger?.verbose(`ignoring null export path "${exportPath}"`);
			continue;
		}
		if (Array.isArray(exportValue)) {
			logger?.verbose(`ignoring array export path "${exportPath}"`);
			continue;
		}

		const findResult = findTypesPathMatching(mapQueryPathToApiTagLevel, exportValue, []);
		if (findResult !== undefined) {
			const { apiTagLevel, relPath, conditions, isTypeOnly } = findResult;

			// Add mapping for API level file generation
			if (apiTagLevel !== undefined) {
				if (mapApiTagLevelToOutput.has(apiTagLevel)) {
					logger?.warning(`${relPath} found in exports multiple times.`);
				} else {
					mapApiTagLevelToOutput.set(apiTagLevel, { relPath, conditions, isTypeOnly });
				}
			}

			// Add mapping for Node10 type compatibility generation if requested.
			// Exclude root "." path as "types" should handle that.
			if (node10TypeCompat && exportPath !== ".") {
				const node10TypeExportPath = exportPath.replace(/(?:\.([cm]?)js)?$/, ".d.$1ts");
				// Nothing needed when export path already matches internal path.
				if (path.resolve(node10TypeExportPath) !== path.resolve(relPath)) {
					mapNode10CompatExportPathToData.set(node10TypeExportPath, {
						relPath,
						isTypeOnly,
					});
				}
			}
		}
	}

	return { mapApiTagLevelToOutput, mapNode10CompatExportPathToData };
}
