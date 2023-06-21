/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, MonoRepo, Package, PackageJson } from "@fluidframework/build-tools";
import path from "node:path";
import { ReleaseGroup } from "./releaseGroups";

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
export const parsePackageSelectionFlags = (flags: any): PackageSelectionCriteria => {
	const options: PackageSelectionCriteria =
		flags.all === true
			? {
					independentPackages: true,
					releaseGroups: ["all"],
					releaseGroupRoots: ["all"],
					directory: undefined,
			  }
			: {
					independentPackages: flags.packages ?? false,
					releaseGroups: flags.releaseGroup ?? [],
					releaseGroupRoots: flags.releaseGroupRoot ?? [],
					directory: flags.directory,
			  };

	return options;
};

/**
 * Parses {@link filterFlags} into a typed object that is more ergonomic than working with the flag values directly.
 *
 * @param flags - The parsed command flags.
 */
export const parsePackageFilterFlags = (flags: any): PackageFilterOptions => {
	const options: PackageFilterOptions = {
		private: flags.private,
		scope: flags.scope,
		skipScope: flags.skipScope,
	};

	return options;
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
): { selected: PackageDetails[]; filtered: PackageDetails[] } => {
	const selected: PackageDetails[] = [];

	if (selection.directory !== undefined) {
		selected.push(
			new PackageDetails(
				path.join(selection.directory, "package.json"),
				"none",
				undefined,
				"packageFromDirectory",
			),
		);
	}

	// Select packages
	if (selection.independentPackages === true) {
		for (const pkg of context.independentPackages) {
			selected.push(new PackageDetails(pkg, pkg.group, pkg.monoRepo, "independentPackage"));
		}
	}

	for (const rg of selection.releaseGroups) {
		for (const pkg of context.packagesInReleaseGroup(rg)) {
			selected.push(
				new PackageDetails(pkg, pkg.group, pkg.monoRepo, "releaseGroupChildPackage"),
			);
		}
	}

	for (const rg of selection.releaseGroupRoots ?? []) {
		const dir = context.packagesInReleaseGroup(rg)[0].directory;
		const pkg = new Package(path.join(dir, "package.json"), rg);
		selected.push(new PackageDetails(pkg, pkg.group, pkg.monoRepo, "releaseGroupRootPackage"));
	}

	const filtered = filter === undefined ? selected : filterPackages(selected, filter);

	return { selected, filtered };
};

type FilterablePackage = Pick<PackageJson, "name" | "private">;

/**
 * Filters a list of packages by the filter criteria.
 *
 * @param packages - An array of packages to be filtered.
 * @param filters - The filter criteria to filter the packages by.
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
		if (pkg.private !== undefined && filters.private !== isPrivate) {
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
 * A convenience type mapping a directory containing a package to its PackageKind.
 */
export class PackageDetails extends Package {
	constructor(
		private readonly pkg: string | Package,
		public readonly group: string,
		public readonly monoRepo: MonoRepo | undefined,
		public readonly kind: PackageKind,
	) {
		super(
			typeof pkg === "string" ? pkg : path.join(pkg.directory, "package.json"),
			typeof pkg === "string" ? "none" : pkg.group,
			typeof pkg === "string" ? undefined : pkg.monoRepo,
		);
		// let packageJson: string;
		// let grp: string;
		// let repo: MonoRepo | undefined;

		// if (typeof pkg === "string") {
		// 	packageJson = pkg;
		// 	grp = "none";
		// } else {
		// 	packageJson = path.join(pkg.directory, "package.json");
		// 	grp = group ? group : pkg.group;
		// 	repo = pkg.monoRepo;
		// }
	}
}
