/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync, writeFileSync } from "fs-extra";
import { sortJsonc } from "sort-jsonc";
import type { Handler } from "./common.js";

const match = /(^|\/)tsconfig.*?\.json/i;

export const tsconfigSorter: Handler = {
	name: "sort-tsconfig",
	match,
	handler: async (file, root): Promise<string | undefined> => {
		if (!isSorted(file)) {
			return `Not sorted: ${file}`;
		}
	},
	resolver: (file, root): { resolved: boolean; message?: string | undefined } => {
		const wroteOutput = sortTsconfig(file, true);
		return { resolved: wroteOutput };
	},
};

export const handlers: Handler[] = [tsconfigSorter];

/**
 * Sorting order for keys in the compilerOptions section of tsconfig. The groups and the order within each group are
 * based on the order at https://www.typescriptlang.org/tsconfig#compiler-options. However, the order of the groups has
 * been adjusted, and a few properties are moved earlier in the order since they're more important to our repo
 * tsconfigs.
 */
const compilerOptionsOrder = [
	"rootDir", // From the Modules group
	"outDir", // From the Emit group
	"module", // From the Modules group
	"moduleResolution", // From the Modules group

	// Emit
	"declaration",
	"declarationDir",
	"declarationMap",
	"downlevelIteration",
	"emitBOM",
	"emitDeclarationOnly",
	"importHelpers",
	"importsNotUsedAsValues",
	"inlineSourceMap",
	"inlineSources",
	"mapRoot",
	"newLine",
	"noEmit",
	"noEmitHelpers",
	"noEmitOnError",
	"outFile",
	"preserveConstEnums",
	"preserveValueImports",
	"removeComments",
	"sourceMap",
	"sourceRoot",
	"stripInternal",

	// Modules
	"allowArbitraryExtensions",
	"allowImportingTsExtensions",
	"allowUmdGlobalAccess",
	"baseUrl",
	"noResolve",
	"paths",
	"resolveJsonModule",
	"rootDirs",
	"typeRoots",
	"types",

	// Type checking
	"allowUnreachableCode",
	"allowUnusedLabels",
	"alwaysStrict",
	"exactOptionalPropertyTypes",
	"noFallthroughCasesInSwitch",
	"noImplicitAny",
	"noImplicitOverride",
	"noImplicitReturns",
	"noImplicitThis",
	"noPropertyAccessFromIndexSignature",
	"noUncheckedIndexedAccess",
	"noUnusedLocals",
	"noUnusedParameters",
	"strict",
	"strictBindCallApply",
	"strictFunctionTypes",
	"strictNullChecks",
	"strictPropertyInitialization",
	"useUnknownInCatchVariables",

	// JavaScript Support
	"allowJs",
	"checkJs",
	"maxNodeModuleJsDepth",

	// Projects
	"composite",
	"disableReferencedProjectLoad",
	"disableSolutionSearching",
	"disableSourceOfProjectReferenceRedirect",
	"incremental",
	"tsBuildInfoFile",

	// Editor Support
	"disableSizeLimit",
	"plugins",

	// InteropConstraints
	"allowSyntheticDefaultImports",
	"esModuleInterop",
	"forceConsistentCasingInFileNames",
	"isolatedModules",
	"preserveSymlinks",

	// Language and Environment
	"emitDecoratorMetadata",
	"experimentalDecorators",
	"jsx",
	"jsxFactory",
	"jsxFragmentFactory",
	"jsxImportSource",
	"lib",
	"noLib",
	"reactNamespace",
	"target",
	"useDefineForClassFields",

	// Diagnostics
	"diagnostics",
	"explainFiles",
	"extendedDiagnostics",
	"generateCpuProfile",
	"listEmittedFiles",
	"listFiles",
	"traceResolution",

	// Output formatting
	"noErrorTruncation",
	"preserveWatchOutput",
	"pretty",

	// Completeness
	"skipDefaultLibCheck",
	"skipLibCheck",

	// Watch Options
	"assumeChangesOnlyAffectDirectDependencies",

	// Backwards Compatibility
	"charset",
	"keyofStringsOnly",
	"noImplicitUseStrict",
	"noStrictGenericChecks",
	"out",
	"suppressExcessPropertyErrors",
	"suppressImplicitAnyIndexErrors",
];

/**
 * Sorting order for tsconfig files.
 */
const sortOrder = [
	"extends",
	"include",
	"exclude",
	"compilerOptions",
	...compilerOptionsOrder,
	"references",
];

/**
 * Sorts a tsconfig file, optionally writing the changes back to the file.
 *
 * @param tsconfigPath - path to a tsconfig file
 * @param write - if true, the file will be overwritten with sorted content
 * @returns true if the file required changes (that is, it was not already sorted), false otherwise
 */
function sortTsconfig(tsconfigPath: string, write: boolean): boolean {
	const origString = readFileSync(tsconfigPath).toString();
	const sortedString = sortJsonc(origString, {
		sort: sortOrder,
	});

	// normalize the original and sorted string using prettier so we can compare them safely
	const config = resolvePrettierConfig(tsconfigPath);
	if (config !== null) {
		config.parser = "jsonc";
	}
	const normalizedInput = prettier(origString, config ?? { parser: "jsonc" });
	const normalizedOutput = prettier(sortedString, config ?? { parser: "jsonc" });
	const updated = normalizedInput !== normalizedOutput;

	if (updated && write) {
		writeFileSync(tsconfigPath, normalizedOutput);
	}

	return updated;
}

/**
 * Checks if a tsconfig file is sorted.
 */
function isSorted(tsconfigPath: string): boolean {
	return !sortTsconfig(tsconfigPath, false);
}
