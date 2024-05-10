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

function findTypesPathMatching<TOutKey>(
	mapQueryPathToOutKey: Map<string | RegExp, TOutKey | undefined>,
	exports: ExportsRecordValue,
	conditions: string[],
): (ExportData & { outKey: TOutKey | undefined }) | undefined {
	for (const [entry, value] of Object.entries(exports)) {
		if (typeof value === "string") {
			if (entry === "types") {
				for (const [key, outKey] of mapQueryPathToOutKey.entries()) {
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
						return { outKey, relPath: value, conditions, isTypeOnly };
					}
				}
			}
		} else if (value !== null) {
			if (Array.isArray(value)) {
				continue;
			}
			const deepFind = findTypesPathMatching(mapQueryPathToOutKey, value, [
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
 * @param mapQueryPathToOutKey - keys of map represent paths to match. When matched
 * value, if defined, is used to set entry key in output mapKeyToOutput.
 * @param node10TypeCompat - when true, populates output mapNode10CompatExportPathToData.
 * @param logger - optional Logger
 * @returns object with mapKeyToOutput, map of ApiTags to output paths, and
 * mapNode10CompatExportPathToData, map of compat file path to Node16 path.
 */
export function queryOutputMapsFromPackageExports<TOutKey>(
	packageJson: PackageJson,
	mapQueryPathToOutKey: Map<string | RegExp, TOutKey | undefined>,
	node10TypeCompat: boolean,
	logger?: Logger,
): {
	mapKeyToOutput: Map<TOutKey, ExportData>;
	mapNode10CompatExportPathToData: Map<string, Node10CompatExportData>;
} {
	const mapKeyToOutput = new Map<TOutKey, ExportData>();
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

		const findResult = findTypesPathMatching(mapQueryPathToOutKey, exportValue, []);
		if (findResult !== undefined) {
			const { outKey, relPath, conditions, isTypeOnly } = findResult;

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

	return { mapKeyToOutput, mapNode10CompatExportPathToData };
}
