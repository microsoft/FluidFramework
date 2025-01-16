/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Logger, PackageJson } from "@fluidframework/build-tools";
import { assert, beforeEach, describe, it } from "vitest";

import type { ExportData, Node10CompatExportData } from "../../library/packageExports.js";
import { queryTypesResolutionPathsFromPackageExports } from "../../library/packageExports.js";

const typeOnlyExportPackage: PackageJson = {
	name: "@fluid-test/test-package-typeonly",
	scripts: {},
	version: "",
	exports: {
		".": {
			import: {
				types: "./lib/public.d.ts",
			},
			require: {
				types: "./dist/public.d.ts",
			},
		},
		"./alpha": {
			types: {
				// a bit unusual authoring where any non-require types lookup
				// will get resolved. (explicit import condition is common.)
				require: "./dist/alpha.d.ts",
				default: "./lib/alpha.d.ts",
			},
		},
		"./types": {
			types: {
				import: "./lib/types.d.ts",
				require: "./dist/types.d.ts",
			},
		},
	},
};

const commonExportsPackage: PackageJson = {
	name: "@fluid-test/test-package-common",
	scripts: {},
	version: "",
	exports: {
		".": {
			import: {
				types: "./lib/public.d.ts",
				default: "./lib/index.js",
			},
			require: {
				types: "./dist/public.d.ts",
				default: "./dist/index.js",
			},
		},
		"./beta": {
			import: {
				types: "./lib/beta.d.ts",
				default: "./lib/index.js",
			},
			require: {
				types: "./dist/beta.d.ts",
				default: "./dist/index.js",
			},
		},
		"./internal": {
			import: {
				types: "./lib/index.d.ts",
				default: "./lib/index.js",
			},
			require: {
				types: "./dist/index.d.ts",
				default: "./dist/index.js",
			},
		},
	},
};

const doubleReferencingExportsPackage: PackageJson = {
	name: "@fluid-test/test-package-double-ref",
	scripts: {},
	version: "",
	exports: {
		".": {
			import: {
				types: "./lib/public.d.ts",
				default: "./lib/index.js",
			},
			require: {
				types: "./dist/public.d.ts",
				default: "./dist/index.js",
			},
		},
		"./beta": {
			types: {
				import: "./lib/beta.d.ts",
				require: "./dist/beta.d.ts",
				// This is a double reference as well as the one below,
				// but this one should be ignored.
				default: "./lib/beta.d.ts",
			},
			default: {
				import: "./lib/index.js",
				require: "./dist/index.js",
			},
		},
		"./double-beta": {
			import: {
				types: "./lib/beta.d.ts",
				default: "./lib/index.js",
			},
			require: {
				types: "./dist/beta.d.ts",
				default: "./dist/index.js",
			},
		},
	},
};

function genTestData(
	path: string,
	condition: string,
): {
	query: Map<string | RegExp, string | undefined>;
	commonExportResults: Map<string, ExportData>;
	commonNode10CompatExportResults: Map<string, Pick<ExportData, "relPath" | "isTypeOnly">>;
	typeOnlyExportResults: Map<string, ExportData>;
	doubleReferenceExportResults: Map<string, ExportData>;
} {
	return {
		query: new Map<string | RegExp, string | undefined>([
			[`./${path}/public.d.ts`, "Public"],
			[`./${path}/beta.d.ts`, "Beta"],
			[`./${path}/alpha.d.ts`, "Alpha"],
			[`./${path}/types.d.ts`, "Types"],
			[new RegExp(`${path}\\/index\\.d\\.?[cm]?ts$`), undefined],
		]),
		commonExportResults: new Map<string, ExportData>([
			[
				"Public",
				{
					relPath: `./${path}/public.d.ts`,
					conditions: [condition, "types"],
					isTypeOnly: false,
				},
			],
			[
				"Beta",
				{
					relPath: `./${path}/beta.d.ts`,
					conditions: [condition, "types"],
					isTypeOnly: false,
				},
			],
			// ["Alpha", { relPath: `./${path}/alpha.d.ts`, conditions: [condition, "types"], isTypeOnly: false }],
			// ["Types", { relPath: `./${path}/types.d.ts`, conditions: [condition, "types"], isTypeOnly: false }],
		]),
		commonNode10CompatExportResults: new Map<string, Node10CompatExportData>([
			[
				`./beta.d.ts`,
				{
					relPath: `./${path}/beta.d.ts`,
					isTypeOnly: false,
				},
			],
			[
				`./internal.d.ts`,
				{
					relPath: `./${path}/index.d.ts`,
					isTypeOnly: false,
				},
			],
		]),
		typeOnlyExportResults: new Map<string, ExportData>([
			[
				"Public",
				{
					relPath: `./${path}/public.d.ts`,
					conditions: [condition, "types"],
					isTypeOnly: true,
				},
			],
			// ["Beta", { relPath: `./${path}/beta.d.ts`, conditions: [condition, "types"], isTypeOnly: true }],
			[
				"Alpha",
				{
					relPath: `./${path}/alpha.d.ts`,
					// "./alpha" is setup with a "default" instead of normal "import" condition
					conditions: condition === "import" ? ["types"] : ["types", condition],
					isTypeOnly: true,
				},
			],
			[
				"Types",
				{
					relPath: `./${path}/types.d.ts`,
					conditions: ["types", condition],
					isTypeOnly: true,
				},
			],
		]),
		doubleReferenceExportResults: new Map<string, ExportData>([
			[
				"Public",
				{
					relPath: `./${path}/public.d.ts`,
					conditions: [condition, "types"],
					isTypeOnly: false,
				},
			],
			[
				"Beta",
				{
					relPath: `./${path}/beta.d.ts`,
					conditions: ["types", condition],
					isTypeOnly: false,
				},
			],
			// ["Alpha", { relPath: `./${path}/alpha.d.ts`, conditions: [condition, "types"], isTypeOnly: false }],
			// ["Types", { relPath: `./${path}/types.d.ts`, conditions: [condition, "types"], isTypeOnly: false }],
		]),
	};
}

class MockLogger implements Logger {
	public calls: [string | Error | undefined, ...unknown[]][] = [];

	log(message?: string, ...args: unknown[]): void {
		this.calls.push([message, ...args]);
	}

	info(msg: string | Error | undefined, ...args: unknown[]): void {
		this.calls.push([msg, ...args]);
	}

	warning(msg: string | Error | undefined, ...args: unknown[]): void {
		this.calls.push([msg, ...args]);
	}

	errorLog(msg: string | Error | undefined, ...args: unknown[]): void {
		this.calls.push([msg, ...args]);
	}

	verbose(msg: string | Error | undefined, ...args: unknown[]): void {
		this.calls.push([msg, ...args]);
	}
}

function assertEquivalentMaps<TKeys, TValues>(
	actual: Map<TKeys, TValues>,
	expected: Map<TKeys, TValues>,
): void {
	assert.hasAllKeys(actual, [...expected.keys()]);
	for (const [key, value] of expected.entries()) {
		assert.deepEqual(actual.get(key), value);
	}
}

describe("library/packageExports", () => {
	describe("queryResolutionPathsFromPackageExports", () => {
		[
			["commonjs (dist path)", "dist", "require"] as const,
			["esm (lib path)", "lib", "import"] as const,
			// eslint-disable-next-line unicorn/no-array-for-each
		].forEach(([desc, path, condition]) =>
			describe(`using ${desc}`, () => {
				const logger = new MockLogger();
				beforeEach(() => {
					logger.calls = [];
				});

				const {
					query,
					commonExportResults,
					commonNode10CompatExportResults,
					typeOnlyExportResults,
					doubleReferenceExportResults,
				} = genTestData(path, condition);

				it("finds path in common package export pattern", () => {
					const { mapKeyToOutput } = queryTypesResolutionPathsFromPackageExports(
						commonExportsPackage,
						query,
						{ node10TypeCompat: false, onlyFirstMatches: true },
						logger,
					);

					// Verify
					assert(logger.calls.length === 0, "logs nothing of interest");
					assertEquivalentMaps(mapKeyToOutput, commonExportResults);
				});

				it("finds type only export paths", () => {
					const { mapKeyToOutput } = queryTypesResolutionPathsFromPackageExports(
						typeOnlyExportPackage,
						query,
						{ node10TypeCompat: false, onlyFirstMatches: true },
						logger,
					);

					// Verify
					assert(logger.calls.length === 0, "logs nothing of interest");
					assertEquivalentMaps(mapKeyToOutput, typeOnlyExportResults);
				});

				it("warns on double referenced export paths", () => {
					const { mapKeyToOutput } = queryTypesResolutionPathsFromPackageExports(
						doubleReferencingExportsPackage,
						query,
						{ node10TypeCompat: false, onlyFirstMatches: true },
						logger,
					);

					// Verify
					assert(logger.calls.length === 1, "logs one warning");
					const message = logger.calls[0]?.[0];
					assert(typeof message === "string");
					assert(
						message.endsWith(" found in exports multiple times."),
						"warning is about multiple references",
					);
					assertEquivalentMaps(mapKeyToOutput, doubleReferenceExportResults);
				});

				it("finds beta and internal in common package export pattern for node10 compat", () => {
					const { mapNode10CompatExportPathToData } =
						queryTypesResolutionPathsFromPackageExports(
							commonExportsPackage,
							query,
							{ node10TypeCompat: true, onlyFirstMatches: true },
							logger,
						);

					// Verify
					assert(logger.calls.length === 0, "logs nothing of interest");
					assertEquivalentMaps(
						mapNode10CompatExportPathToData,
						commonNode10CompatExportResults,
					);
				});
			}),
		);
	});
});
