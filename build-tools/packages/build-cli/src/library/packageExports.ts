/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { Logger, PackageJson } from "@fluidframework/build-tools";

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
	 * Conditions required for export access; in hierarchy order.
	 */
	conditions: readonly string[];
	/**
	 * Package export path is only for "types" (expected .d.ts file(s)).
	 * Precisely, there are no alternate conditions where "types" condition
	 * is set, from the package path this export relates to.
	 * In other words, if "types" condition is removed from all of those that
	 * are required to resolve to this file, there are *definitely* no other
	 * resolutions.
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

/**
 * Returns value of first key to match test value, if any.
 *
 * @param test - the value to check key conditions against
 * @param mapQuery - map with keys as match conditions (exact strings or regex)
 * @returns undefined when there are no matches or the value of matched key as \{ value: value \}
 */
function valueOfFirstKeyMatching<TValue>(
	test: string,
	mapQuery: ReadonlyMap<string | RegExp, TValue>,
): { value: TValue } | undefined {
	for (const [key, value] of mapQuery.entries()) {
		if (typeof key === "string" ? path.resolve(test) === path.resolve(key) : key.test(test)) {
			// box value to distinguish nothing found from found value that is undefined.
			return { value };
		}
	}
	return undefined;
}

// Some common "exports" conditions
const typesExportCondition = "types";
const defaultExportCondition = "default";

/**
 * Performs a depth first search of exports conditions looking for "types" constrained
 * resolution paths (relative file path) matching keys in query map.
 *
 * @param mapQueryPathToOutKey - map with match keys
 * @param exports - export conditions
 * @param onlyFirstMatch - when true, only the first match is returned
 * @param previous - accumulated conditions and sense of t
 * @returns matching export data and matching query entry value as outKey property
 */
function findTypesPathsMatching<TOutKey>(
	mapQueryPathToOutKey: ReadonlyMap<string | RegExp, TOutKey | undefined>,
	exports: Readonly<ExportsRecordValue>,
	onlyFirstMatch: boolean,
	previous: Readonly<{
		conditions: readonly string[];
		isTypeOnly?: boolean;
	}>,
): (ExportData & { outKey: TOutKey | undefined })[] {
	const results: (ExportData & { outKey: TOutKey | undefined })[] = [];
	// All exports are type only if there was a previous condition where the only option
	// was "types" constrained. Otherwise they may still become constrained or not.
	const isTypeOnlySettled =
		(previous.isTypeOnly ?? false) && previous.conditions.includes(typesExportCondition);
	const entries = Object.entries(exports);
	for (const [entry, value] of entries) {
		// Current conditions
		// "default" is not an explicit condition, but a catch all; so, never add it to conditions
		const conditions =
			entry === defaultExportCondition ? previous.conditions : [...previous.conditions, entry];
		const isTypeOnly =
			isTypeOnlySettled || (entries.length === 1 && entry === typesExportCondition);
		// First check if this entry is a leaf; where value is only
		// expected to be a string (a relative file path).
		if (typeof value === "string") {
			const relPath = value;
			// At the leaf level, look for "types" entries which either is the current
			// condition (entry) or is an inherited condition, both of which have been
			// combined into local conditions.
			if (conditions.includes(typesExportCondition)) {
				const queryResult = valueOfFirstKeyMatching(relPath, mapQueryPathToOutKey);
				if (queryResult !== undefined) {
					results.push({ outKey: queryResult.value, relPath, conditions, isTypeOnly });
				}
			}
		} else if (value !== null) {
			// Type constrain away array set that is not supported (and not expected
			// but non-fatal to known use cases).
			if (Array.isArray(value)) {
				continue;
			}
			const deepFind = findTypesPathsMatching(mapQueryPathToOutKey, value, onlyFirstMatch, {
				conditions,
				isTypeOnly,
			});
			if (deepFind !== undefined) {
				results.push(...deepFind);
			}
		}

		if (onlyFirstMatch && results.length > 0) {
			return results;
		}
	}

	return results;
}

/**
 * Read package "exports" to determine which of given "types" file paths are present.
 *
 * @param packageJson - json content of package.json
 * @param mapQueryPathToOutKey - keys of map represent paths to match. When one of those
 * paths is found in the package.json's exports, the corresponding value (if defined) is
 * used to set entry key in output mapKeyToOutput.
 * @param node10TypeCompat - when true, populates output mapNode10CompatExportPathToData.
 * @param onlyFirstMatches - when true, only the first matches are returned per exports path.
 * @param logger - optional Logger
 * @returns object with mapKeyToOutput, map of ApiTags to output paths, and
 * mapNode10CompatExportPathToData, map of compat file path to Node16 path.
 */
export function queryTypesResolutionPathsFromPackageExports<TOutKey>(
	packageJson: PackageJson,
	mapQueryPathToOutKey: ReadonlyMap<string | RegExp, TOutKey | undefined>,
	{
		node10TypeCompat,
		onlyFirstMatches,
	}: { node10TypeCompat: boolean; onlyFirstMatches: boolean },
	logger?: Logger,
): {
	mapKeyToOutput: Map<TOutKey, ExportData>;
	mapNode10CompatExportPathToData: Map<string, Node10CompatExportData>;
	mapTypesPathToExportPaths: Map<
		string,
		Readonly<{ exportPath: string; conditions: readonly string[] }>[]
	>;
} {
	const mapKeyToOutput = new Map<TOutKey, ExportData>();
	const mapNode10CompatExportPathToData = new Map<string, Node10CompatExportData>();
	const mapTypesPathToExportPaths = new Map<
		string,
		Readonly<{ exportPath: string; conditions: readonly string[] }>[]
	>();

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

		const findResults = findTypesPathsMatching(
			mapQueryPathToOutKey,
			exportValue,
			onlyFirstMatches,
			{
				conditions: [],
			},
		);
		for (const findResult of findResults) {
			const { outKey, relPath, conditions, isTypeOnly } = findResult;

			const existingExportsPaths = mapTypesPathToExportPaths.get(relPath);
			if (existingExportsPaths === undefined) {
				mapTypesPathToExportPaths.set(relPath, [{ exportPath, conditions }]);
			} else {
				existingExportsPaths.push({ exportPath, conditions });
			}

			// Add mapping for using given key, if defined.
			if (outKey !== undefined) {
				if (mapKeyToOutput.has(outKey)) {
					logger?.warning(`${relPath} found in exports multiple times.`);
				} else {
					mapKeyToOutput.set(outKey, { relPath, conditions, isTypeOnly });
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

	return { mapKeyToOutput, mapNode10CompatExportPathToData, mapTypesPathToExportPaths };
}
