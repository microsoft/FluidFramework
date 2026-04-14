/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type CompilerOptions, ModuleKind, Project } from "ts-morph";

/**
 * Creates a ts-morph {@link Project} configured with Node16 module resolution and no tsconfig file loading.
 *
 * @param compilerOptionOverrides - Additional compiler options to merge with the base Node16 configuration.
 * @returns A new ts-morph {@link Project}.
 */
export function createNode16TsMorphProject(
	compilerOptionOverrides?: CompilerOptions,
): Project {
	return new Project({
		skipAddingFilesFromTsConfig: true,
		// Note: it is likely better to leverage a tsconfig file from package rather than
		// assume Node16 and no other special setup. However, currently configs are pretty
		// standard with simple Node16 module specification and using a tsconfig for just
		// part of its setting may be confusing to document and keep tidy with dual-emit.
		compilerOptions: {
			module: ModuleKind.Node16,
			...compilerOptionOverrides,
		},
	});
}
