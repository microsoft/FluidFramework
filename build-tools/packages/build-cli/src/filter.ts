/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { type MonoRepo, Package } from "@fluidframework/build-tools";
import { type PackageSelectionDefault, filterFlags, selectionFlags } from "./flags.js";
import { Context } from "./library/index.js";
import { ReleaseGroup, knownReleaseGroups } from "./releaseGroups.js";

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
	 * Selects a package rooted in a directory.
	 */
	directory?: string[];

	/**
	 * If set, only selects packages that have changes when compared with the branch of this name.
	 */
	changedSinceBranch?: string;
}

/**
 * A pre-defined PackageSelectionCriteria that selects all packages.
 */
export const AllPackagesSelectionCriteria: PackageSelectionCriteria = {
	independentPackages: true,
	releaseGroups: [...knownReleaseGroups],
	releaseGroupRoots: [...knownReleaseGroups],
	directory: undefined,
	changedSinceBranch: undefined,
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
 * @param defaultSelection - Controls what packages are selected when all flags are set to their default values. With
 * the default value of undefined, no packages will be selected. Setting this to `all` will select all packages by
 * default. Setting it to `dir` will select the package in the current directory.
 */
export const parsePackageSelectionFlags = (
	flags: selectionFlags,
	defaultSelection: PackageSelectionDefault,
): PackageSelectionCriteria => {
	const useDefault =
		flags.releaseGroup === undefined &&
		flags.releaseGroupRoot === undefined &&
		flags.dir === undefined &&
		(flags.packages === false || flags.packages === undefined) &&
		(flags.all === false || flags.all === undefined);

	if (flags.all || (useDefault && defaultSelection === "all")) {
		return AllPackagesSelectionCriteria;
	}

	if (useDefault && defaultSelection === "dir") {
		return {
			independentPackages: false,
			releaseGroups: [],
			releaseGroupRoots: [],
			directory: ["."],
		};
	}

	const releaseGroups =
		flags.releaseGroup?.includes("all") === true
			? AllPackagesSelectionCriteria.releaseGroups
			: flags.releaseGroup;

	const roots =
		flags.releaseGroupRoot?.includes("all") === true
			? AllPackagesSelectionCriteria.releaseGroupRoots
			: flags.releaseGroupRoot;

	return {
		independentPackages: flags.packages ?? false,
		releaseGroups: (releaseGroups ?? []) as ReleaseGroup[],
		releaseGroupRoots: (roots ?? []) as ReleaseGroup[],
		directory: flags.dir,
	};
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
export async function selectPackagesFromContext(
	context: Context,
	selection: PackageSelectionCriteria,
): Promise<PackageWithKind[]> {
	// package name -> package
	// If two kinds result in loading a package, the first is used.
	const selected: Map<string, PackageWithKind> = new Map();
	function addPackage(
		packageJsonFileName: string,
		group: string,
		monoRepo?: MonoRepo,
		additionalProperties?: {
			kind: PackageKind;
		},
	): void {
		const pkg = Package.load(packageJsonFileName, group, monoRepo, additionalProperties);
		if (!selected.has(pkg.name)) {
			selected.set(pkg.name, pkg);
		}
	}

	if (selection.changedSinceBranch !== undefined) {
		const git = await context.getGitRepository();
		const remote = await git.getRemote(git.upstreamRemotePartialUrl);
		if (remote === undefined) {
			throw new Error(`Can't find a remote with ${git.upstreamRemotePartialUrl}`);
		}
		const { packages } = await git.getChangedSinceRef(
			selection.changedSinceBranch,
			remote,
			context,
		);
		for (const p of packages) {
			addPackage(p.packageJsonFileName, "none", undefined, {
				kind: "packageFromDirectory",
			});
		}
	}

	for (const directory of selection.directory ?? []) {
		addPackage(
			path.join(directory === "." ? process.cwd() : directory, "package.json"),
			"none",
			undefined,
			{
				kind: "packageFromDirectory" as PackageKind,
			},
		);
	}

	// Select independent packages
	if (selection.independentPackages === true) {
		for (const pkg of context.independentPackages) {
			addPackage(pkg.packageJsonFileName, pkg.group, pkg.monoRepo, {
				kind: "independentPackage",
			});
		}
	}

	// Select release group packages
	for (const rg of selection.releaseGroups) {
		for (const pkg of context.packagesInReleaseGroup(rg)) {
			addPackage(pkg.packageJsonFileName, pkg.group, pkg.monoRepo, {
				kind: "releaseGroupChildPackage",
			});
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
		addPackage(path.join(dir, "package.json"), rg, packages[0].monoRepo, {
			kind: "releaseGroupRootPackage",
		});
	}

	return [...selected.values()];
}

/**
 * Selects packages from the context based on the selection. The selected packages will be filtered by the filter
 * criteria if provided.
 *
 * @param context - The context.
 * @param selection - The selection criteria to use to select packages.
 * @param filter - An optional filter criteria to filter selected packages by.
 * @returns An object containing the selected packages and the filtered packages.
 */
export async function selectAndFilterPackages(
	context: Context,
	selection: PackageSelectionCriteria,
	filter?: PackageFilterOptions,
): Promise<{ selected: PackageWithKind[]; filtered: PackageWithKind[] }> {
	const selected = await selectPackagesFromContext(context, selection);

	// Filter packages if needed
	const filtered = filter === undefined ? selected : await filterPackages(selected, filter);

	return { selected, filtered };
}

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
export async function filterPackages<T extends FilterablePackage>(
	packages: T[],
	filters: PackageFilterOptions,
): Promise<T[]> {
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
