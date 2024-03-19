/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { Package } from "@fluidframework/build-tools";

import { filterFlags, selectionFlags } from "./flags";
import { Context } from "./library";
import { ReleaseGroup, knownReleaseGroups } from "./releaseGroups";

/**
 * The criteria that should be used for selecting package-like objects from a collection.
 */
export interface PackageSelectionCriteria {
	/**
	 * True if independent packages are selected; false otherwise.
	 */
	independentPackages: boolean;

	/**
	 * An array of release groups whose packages are selected.
	 */
	releaseGroups: ReleaseGroup[];

	/**
	 * An array of release groups whose root packages are selected.
	 */
	releaseGroupRoots: ReleaseGroup[];

	/**
	 * If set, only selects the single package in this directory.
	 */
	directory?: string;
}

/**
 * A pre-defined PackageSelectionCriteria that selects all packages.
 */
export const AllPackagesSelectionCriteria: PackageSelectionCriteria = {
	independentPackages: true,
	releaseGroups: [...knownReleaseGroups],
	releaseGroupRoots: [...knownReleaseGroups],
	directory: undefined,
};

/**
 * The criteria that should be used for filtering package-like objects from a collection.
 */
export interface PackageFilterOptions {
	/**
	 * If set, filters IN packages whose scope matches the strings provided.
	 */
	scope?: string[];
	/**
	 * If set, filters OUT packages whose scope matches the strings provided.
	 */
	skipScope?: string[];

	/**
	 * If set, filters private packages in/out.
	 */
	private: boolean | undefined;
}

/**
 * Parses {@link selectionFlags} into a typed object that is more ergonomic than working with the flag values directly.
 *
 * @param flags - The parsed command flags.
 */
export const parsePackageSelectionFlags = (
	flags: selectionFlags,
): PackageSelectionCriteria => {
	const options: PackageSelectionCriteria =
		flags.all === true
			? AllPackagesSelectionCriteria
			: {
					independentPackages: flags.packages ?? false,
					releaseGroups: (flags.releaseGroup as ReleaseGroup[]) ?? [],
					releaseGroupRoots: (flags.releaseGroupRoot as ReleaseGroup[]) ?? [],
					directory: flags.dir,
			  };

	return options;
};

/**
 * Parses {@link filterFlags} into a typed object that is more ergonomic than working with the flag values directly.
 *
 * @param flags - The parsed command flags.
 */
export const parsePackageFilterFlags = (flags: filterFlags): PackageFilterOptions => {
	const options: PackageFilterOptions = {
		private: flags.private,
		scope: flags.scope,
		skipScope: flags.skipScope,
	};

	return options;
};

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
	 * when running on a package directly using its directory.
	 */
	| "packageFromDirectory";

/**
 * A convenience type mapping a package to its PackageKind.
 */
export type PackageWithKind = Package & { kind: PackageKind };

/**
 * Selects packages from the context based on the selection.
 *
 * @param context - The context.
 * @param selection - The selection criteria to use to select packages.
 * @returns An array containing the selected packages.
 */
const selectPackagesFromContext = (
	context: Context,
	selection: PackageSelectionCriteria,
): PackageWithKind[] => {
	const selected: PackageWithKind[] = [];

	if (selection.directory !== undefined) {
		const pkg = Package.load(
			path.join(selection.directory, "package.json"),
			"none",
			undefined,
			{
				kind: "packageFromDirectory" as PackageKind,
			},
		);
		selected.push(pkg);
	}

	// Select independent packages
	if (selection.independentPackages === true) {
		for (const pkg of context.independentPackages) {
			selected.push(
				Package.load(pkg.packageJsonFileName, pkg.group, pkg.monoRepo, {
					kind: "independentPackage",
				}),
			);
		}
	}

	// Select release group packages
	for (const rg of selection.releaseGroups) {
		for (const pkg of context.packagesInReleaseGroup(rg)) {
			selected.push(
				Package.load(pkg.packageJsonFileName, pkg.group, pkg.monoRepo, {
					kind: "releaseGroupChildPackage",
				}),
			);
		}
	}

	// Select release group root packages
	for (const rg of selection.releaseGroupRoots ?? []) {
		const packages = context.packagesInReleaseGroup(rg);
		if (packages.length === 0) {
			continue;
		}

		if (packages[0].monoRepo === undefined) {
			throw new Error(`No release group found for package: ${packages[0].name}`);
		}

		const dir = packages[0].monoRepo.directory;
		const pkg = Package.loadDir(dir, rg);
		selected.push(Package.loadDir(dir, rg, pkg.monoRepo, { kind: "releaseGroupRootPackage" }));
	}

	return selected;
};

/**
 * Selects packages from the context based on the selection. The selected packages will be filtered by the filter
 * criteria if provided.
 *
 * @param context - The context.
 * @param selection - The selection criteria to use to select packages.
 * @param filter - An optional filter criteria to filter selected packages by.
 * @returns An object containing the selected packages and the filtered packages.
 */
export const selectAndFilterPackages = (
	context: Context,
	selection: PackageSelectionCriteria,
	filter?: PackageFilterOptions,
): { selected: PackageWithKind[]; filtered: PackageWithKind[] } => {
	const selected = selectPackagesFromContext(context, selection);

	// Filter packages if needed
	const filtered = filter === undefined ? selected : filterPackages(selected, filter);

	return { selected, filtered };
};

/**
 * Convenience type that extracts only the properties of a package that are needed for filtering.
 */
type FilterablePackage = Pick<Package, "name" | "private">;

/**
 * Filters a list of packages by the filter criteria.
 *
 * @param packages - An array of packages to be filtered.
 * @param filters - The filter criteria to filter the packages by.
 * @typeParam T - The type of the package-like objects being filtered.
 * @returns An array containing only the filtered items.
 */
export function filterPackages<T extends FilterablePackage>(
	packages: T[],
	filters: PackageFilterOptions,
): T[] {
	const filtered = packages.filter((pkg) => {
		if (filters === undefined) {
			return true;
		}

		const isPrivate: boolean = pkg.private ?? false;
		if (filters.private !== undefined && filters.private !== isPrivate) {
			return false;
		}

		const scopeIn = scopesToPrefix(filters?.scope);
		const scopeOut = scopesToPrefix(filters?.skipScope);

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
				if (pkg.name.startsWith(scope) === true) {
					return false;
				}
			}
		}
		return true;
	});

	return filtered;
}

function scopesToPrefix(scopes: string[] | undefined): string[] | undefined {
	return scopes === undefined ? undefined : scopes.map((s) => `${s}/`);
}
