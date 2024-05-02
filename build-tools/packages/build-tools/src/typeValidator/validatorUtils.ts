/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { Project } from "ts-morph";
import type { Package } from "../common/npmPackage";

let shouldLog = false;
export function enableLogging(enable: boolean) {
	shouldLog = enable;
}

export function log(output: any) {
	if (shouldLog) {
		console.log(output);
	}
}

/**
 * This uses the bit shifts instead of incrementing because it allows us to OR the
 * results of multiple checks together to get the largest breaking increment at the
 * end without needing to do any max(x,y) checks
 */
export enum BreakingIncrement {
	none = 0,
	minor = 1,
	major = (minor << 1) | minor,
}

export interface IValidator {
	/**
	 * Validate the internal state.  May mutate state and is only valid to call once
	 * @param project - The Project which may be used to run a ts compilation task
	 * @param pkgDir - The dir for the Project which may be used to create temporary
	 *      source files
	 */
	validate(project: Project, pkgDir: string): BreakingIncrement;
}

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
