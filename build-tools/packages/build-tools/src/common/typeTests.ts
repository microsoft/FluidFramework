/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import type { Package } from "./npmPackage";

/**
 * Given a package, returns the name that should be used for the previous version of the package to generate type tests.
 *
 * @privateRemarks
 *
 * This function is here instead of in build-cli because it is shared between fluid-build's task handler for type test
 * generation and the generation code that mostly lives in build-cli. Long term this function should move to build-cli
 * or a third library package and be used by fluid-build and build-cli.
 */
export function getTypeTestPreviousPackageDetails(pkg: Package): {
	name: string;
	packageJsonPath: string;
} {
	const previousPackageName = `${pkg.name}-previous`;
	const previousBasePath = path.join(pkg.directory, "node_modules", previousPackageName);
	const previousPackageJsonPath = path.join(previousBasePath, "package.json");
	return {
		name: previousPackageName,
		packageJsonPath: previousPackageJsonPath,
	};
}
