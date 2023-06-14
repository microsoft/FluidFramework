/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, Package } from "@fluidframework/build-tools";
import path from "node:path";
import { ReleaseGroup } from "./releaseGroups";

export interface PackageSelectionCriteria {
	independentPackages?: boolean;
	releaseGroups?: (ReleaseGroup | "all")[];
	releaseGroupRoots?: (ReleaseGroup | "all")[];
}

export interface PackageFilterOptions {
	// all?: boolean;
	scope?: string[];
	skipScope?: string[];
	private: boolean | undefined;
}

export const parsePackageSelectionFlags = (flags: any): PackageSelectionCriteria => {
	const options: PackageSelectionCriteria = {};
	// options.all = flags.all ?? false;
	options.independentPackages = flags.packages ?? false;
	options.releaseGroups = flags.releaseGroups ?? [];
	options.releaseGroupRoots = flags.releaseGroupRoots ?? [];
	return options;
};

export const parsePackageFilterFlags = (flags: any): PackageFilterOptions => {
	const options: PackageFilterOptions = {
		private: flags.private === undefined ? "" : flags.private,
		scope: flags.scope ?? [],
		skipScope: flags.skipScope ?? [],
	};

	return options;
};

export const selectAndFilterPackages = (
	context: Context,
	selection: PackageSelectionCriteria,
	filter?: PackageFilterOptions,
): { selected: [Package, PackageKind][]; filtered: [Package, PackageKind][] } => {
	const selected: [Package, PackageKind][] = [];

	// Select packages
	if (selection.independentPackages === true) {
		for (const pkg of context.independentPackages) {
			selected.push([pkg, "independentPackage"]);
		}
	}

	for (const rg of selection.releaseGroups ?? []) {
		for (const pkg of context.packagesInReleaseGroup(rg)) {
			selected.push([pkg, "releaseGroupChildPackage"]);
		}
	}

	for (const rg of selection.releaseGroupRoots ?? []) {
		const dir = context.packagesInReleaseGroup(rg)[0].directory;
		const pkg = new Package(path.join(dir, "package.json"), rg);
		selected.push([pkg, "releaseGroupRootPackage"]);
	}

	const filtered = selected.filter((details) => {
		const [pkg] = details;
		const isPrivate: boolean = pkg.packageJson.private ?? false;
		if (filter?.private !== undefined && filter?.private !== isPrivate) {
			return false;
		}

		const scopeIn = scopesToPrefix(filter?.scope);
		const scopeOut = scopesToPrefix(filter?.skipScope);

		if (scopeIn !== undefined) {
			let found = false;
			for (const scope of scopeIn) {
				found ||= pkg.name.startsWith(scope);
			}
			if (!found) {
				return false;
			}
		}
		if (scopeOut !== undefined) {
			for (const scope of scopeOut) {
				if (pkg.name.startsWith(scope) ?? false) {
					return false;
				}
			}
		}
		return true;
	});

	return { selected, filtered };
};

function scopesToPrefix(scopes: string[] | undefined): string[] | undefined {
	return scopes === undefined ? undefined : scopes.map((s) => `${s}/`);
}

/**
 * A type indicating the kind of package that is being processed. This enables subcommands to vary behavior based on the
 * type of package.
 */
export type PackageKind =
	/**
	 * Package is an independent package.
	 */
	| "independentPackage"

	/**
	 * Package is part of a release group, but is _not_ the root.
	 */
	| "releaseGroupChildPackage"

	/**
	 * Package is the root package of a release group.
	 */
	| "releaseGroupRootPackage"

	/**
	 * Package is being loaded from a directory. The package may be one of the other three kinds. This kind is only used
	 * when running on a package diurectly using its directory.
	 */
	| "packageFromDirectory";
