/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The details of a package to install for compatibility testing.
 * @internal
 */
export interface PackageToInstall {
	/** The name of the package to install. */
	pkgName: string;
	/**
	 * The minimum version where the package should be installed.
	 * If the requested version is lower than this, the package will not be installed. This enables
	 * compatibility testing for packages which were not yet part of the Fluid Framework at certain
	 * versions.
	 */
	minVersion: string;
	/**
	 * Entrypoint to load from, if available. Otherwise, the root entrypoint will be used.
	 */
	preferredEntrypoint?: "." | `./${string}`;
}

/**
 * The list of all the packages to install for compatibility testing.
 *
 * This list is read by the `update-compat-versions` script to generate workspace `package.json`
 * files. Changing this list requires re-running `pnpm run update-compat-versions` and committing
 * the updated workspace files.
 * @internal
 */
export const packageListToInstall: PackageToInstall[] = [
	{ pkgName: "@fluidframework/local-driver", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/odsp-driver", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/routerlicious-driver", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/container-loader", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/container-runtime", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/aqueduct", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/datastore", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/test-utils", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/cell", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/counter", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/map", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/matrix", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/ordered-collection", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/register-collection", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/sequence", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/agent-scheduler", minVersion: "0.56.0" },
	{ pkgName: "@fluidframework/tree", minVersion: "2.0.0", preferredEntrypoint: "./internal" },
];
