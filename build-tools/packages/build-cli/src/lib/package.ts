/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Context, Logger, MonoRepo, Package, VersionDetails } from "@fluidframework/build-tools";
import { ReleaseVersion, isPrereleaseVersion } from "@fluid-tools/version-tools";
import { PackageName } from "@rushstack/node-core-library";
import { strict as assert } from "assert";
import { compareDesc, differenceInBusinessDays } from "date-fns";
import { readJsonSync } from "fs-extra";
import ncu from "npm-check-updates";
import type { Index } from "npm-check-updates/build/src/types/IndexType";
import { VersionSpec } from "npm-check-updates/build/src/types/VersionSpec";
import path from "path";
import * as semver from "semver";

import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../releaseGroups";
import { DependencyUpdateType } from "./bump";
import { indentString } from "./text";

/**
 * An object that maps package names to version strings or range strings.
 *
 * @internal
 */
export interface PackageVersionMap {
	[packageName: ReleasePackage | ReleaseGroup]: ReleaseVersion;
}

/**
 * Checks the npm registry for updates for a release group's dependencies.
 *
 * @param context - The {@link Context}.
 * @param releaseGroup - The release group to check. If it is `undefined`, the whole repo is checked.
 * @param depsToUpdate - An array of packages on which dependencies should be checked.
 * @param releaseGroupFilter - If provided, this release group won't be checked for dependencies. Set this when you are
 * updating the dependencies on a release group across the repo. For example, if you have just released the 1.2.3 client
 * release group, you want to bump everything in the repo to 1.2.3 except the client release group itself.
 * @param depUpdateType - The constraint to use when deciding if updates are available.
 * @param prerelease - If true, include prerelease versions as eligible to update.
 * @param writeChanges - If true, changes will be written to the package.json files.
 * @param log - A {@link Logger}.
 * @returns An array of packages that had updated dependencies.
 *
 * @internal
 */
// eslint-disable-next-line max-params
export async function npmCheckUpdates(
	context: Context,
	releaseGroup: ReleaseGroup | ReleasePackage | undefined,
	depsToUpdate: ReleasePackage[] | RegExp[],
	releaseGroupFilter: ReleaseGroup | undefined,
	depUpdateType: DependencyUpdateType,
	// eslint-disable-next-line default-param-last
	prerelease = false,
	// eslint-disable-next-line default-param-last
	writeChanges = false,
	log?: Logger,
): Promise<{
	updatedPackages: Package[];
	updatedDependencies: PackageVersionMap;
}> {
	const updatedPackages: Package[] = [];

	/**
	 * A set of all the packageName, versionString pairs of updated dependencies.
	 */
	const updatedDependencies: PackageVersionMap = {};

	// There can be a lot of duplicate log lines from npm-check-updates, so collect and dedupe before logging.
	const upgradeLogLines = new Set<string>();
	const searchGlobs: string[] = [];
	const repoPath = context.repo.resolvedRoot;

	const releaseGroupsToCheck =
		releaseGroup === undefined // run on the whole repo
			? [...context.repo.releaseGroups.keys()]
			: isReleaseGroup(releaseGroup) // run on just this release group
			? [releaseGroup]
			: undefined;

	const packagesToCheck =
		releaseGroup === undefined // run on the whole repo
			? [...context.independentPackages] // include all independent packages
			: isReleaseGroup(releaseGroup)
			? [] // run on a release group so no independent packages should be included
			: [context.fullPackageMap.get(releaseGroup)]; // the releaseGroup argument must be a package

	if (releaseGroupsToCheck !== undefined) {
		for (const group of releaseGroupsToCheck) {
			if (group === releaseGroupFilter) {
				log?.verbose(
					`Skipped release group ${releaseGroupFilter} because we're updating deps on that release group.`,
				);
				continue;
			}

			const releaseGroupRoot = context.repo.releaseGroups.get(group);
			if (releaseGroupRoot === undefined) {
				throw new Error(`Cannot find release group: ${group}`);
			}

			log?.verbose(
				`Adding ${releaseGroupRoot.workspaceGlobs.length} globs for release group ${releaseGroupRoot.kind}.`,
			);

			searchGlobs.push(
				...releaseGroupRoot.workspaceGlobs.map((g) =>
					path.join(path.relative(repoPath, releaseGroupRoot.repoPath), g),
				),
				// Includes the root package.json, in case there are deps there that also need upgrade.
				path.relative(repoPath, releaseGroupRoot.repoPath),
			);
		}
	}

	if (packagesToCheck !== undefined) {
		for (const pkg of packagesToCheck) {
			if (pkg !== undefined) {
				searchGlobs.push(path.relative(repoPath, pkg.directory));
			}
		}
	}

	log?.info(`Checking npm for package updates...`);

	for (const glob of searchGlobs) {
		log?.verbose(`Checking packages in ${path.join(repoPath, glob)}`);

		// eslint-disable-next-line no-await-in-loop
		const result = (await ncu({
			filter: depsToUpdate,
			cwd: repoPath,
			packageFile: glob === "" ? "package.json" : `${glob}/package.json`,
			target: depUpdateType,
			pre: prerelease,
			upgrade: writeChanges,
			jsonUpgraded: true,
			silent: true,
			peer: true,
		})) as Index<VersionSpec>;

		if (typeof result !== "object") {
			throw new TypeError(`Expected an object: ${typeof result}`);
		}

		// npm-check-updates returns different data depending on how many packages were updated. This code detects the
		// two main cases: a single package or multiple packages.
		if (glob.endsWith("*")) {
			for (const [pkgJsonPath, upgradedDeps] of Object.entries(result)) {
				const jsonPath = path.join(repoPath, pkgJsonPath);
				const { name } = readJsonSync(jsonPath);
				const pkg = context.fullPackageMap.get(name);
				if (pkg === undefined) {
					log?.warning(`Package not found in context: ${name}`);
					continue;
				}

				for (const [dep, newRange] of Object.entries(upgradedDeps)) {
					upgradeLogLines.add(indentString(`${dep}: '${newRange}'`));
					updatedDependencies[dep] = newRange;
				}

				if (Object.keys(upgradedDeps).length > 0) {
					updatedPackages.push(pkg);
				}
			}
		} else {
			const jsonPath = path.join(repoPath, glob, "package.json");
			const { name } = readJsonSync(jsonPath);
			const pkg = context.fullPackageMap.get(name);
			if (pkg === undefined) {
				log?.warning(`Package not found in context: ${name}`);
				continue;
			}

			for (const [dep, newRange] of Object.entries(result)) {
				upgradeLogLines.add(indentString(`${dep}: '${newRange}'`));
				updatedDependencies[dep] = newRange;
			}

			if (Object.keys(result).length > 0) {
				updatedPackages.push(pkg);
			}
		}
	}

	log?.info(`${upgradeLogLines.size} released dependencies found on npm:`);
	for (const line of upgradeLogLines.values()) {
		log?.info(line);
	}

	return { updatedPackages, updatedDependencies };
}

/**
 * An object containing release groups and package dependencies that are a prerelease version.
 *
 * @internal
 */
export interface PreReleaseDependencies {
	/**
	 * A map of release groups to a version string.
	 */
	releaseGroups: Map<ReleaseGroup, string>;
	/**
	 * A map of release packages to a version string. Only includes independent packages.
	 */
	packages: Map<ReleasePackage, string>;
	/**
	 * True if there are no pre-release dependencies. False otherwise.
	 */
	isEmpty: boolean;
}

/**
 * Checks all the packages in a release group for any that are a pre-release version.
 *
 * @param context - The context.
 * @param releaseGroup - The release group.
 * @returns A {@link PreReleaseDependencies} object containing the pre-release dependency names and versions.
 *
 * @internal
 */
export async function getPreReleaseDependencies(
	context: Context,
	releaseGroup: ReleaseGroup | ReleasePackage,
	// depsToUpdate: ReleasePackage[],
): Promise<PreReleaseDependencies> {
	const prereleasePackages = new Map<ReleasePackage, string>();
	const prereleaseGroups = new Map<ReleaseGroup, string>();
	let packagesToCheck: Package[];
	let depsToUpdate: ReleasePackage[];

	if (isReleaseGroup(releaseGroup)) {
		const monorepo = context.repo.releaseGroups.get(releaseGroup);
		if (monorepo === undefined) {
			throw new Error(`Can't find release group in context: ${releaseGroup}`);
		}

		packagesToCheck = monorepo.packages;
		depsToUpdate = context.packagesNotInReleaseGroup(releaseGroup).map((p) => p.name);
	} else {
		const pkg = context.fullPackageMap.get(releaseGroup);
		if (pkg === undefined) {
			throw new Error(`Can't find package in context: ${releaseGroup}`);
		}

		packagesToCheck = [pkg];
		depsToUpdate = context.packagesNotInReleaseGroup(pkg).map((p) => p.name);
	}

	for (const pkg of packagesToCheck) {
		for (const { name: depName, version: depVersion } of pkg.combinedDependencies) {
			// If it's not a dep we're looking to update, skip to the next dep
			if (!depsToUpdate.includes(depName)) {
				continue;
			}

			// Convert the range into the minimum version
			const minVer = semver.minVersion(depVersion);
			if (minVer === null) {
				throw new Error(`semver.minVersion was null: ${depVersion} (${depName})`);
			}

			// If the min version has a pre-release section, then it needs to be released.
			if (isPrereleaseVersion(minVer) === true) {
				const depPkg = context.fullPackageMap.get(depName);
				if (depPkg === undefined) {
					throw new Error(`Can't find package in context: ${depName}`);
				}

				if (depPkg.monoRepo === undefined) {
					prereleasePackages.set(depPkg.name, depVersion);
				} else {
					prereleaseGroups.set(depPkg.monoRepo.kind, depVersion);
				}
			}
		}
	}

	const isEmpty = prereleaseGroups.size === 0 && prereleasePackages.size === 0;
	return {
		releaseGroups: prereleaseGroups,
		packages: prereleasePackages,
		isEmpty,
	};
}

/**
 * Returns true if a release group or package in the repo has been released.
 *
 * @param context - The context.
 * @param releaseGroupOrPackage - The release group to check.
 * @returns True if the release group was released.
 *
 * @remarks
 *
 * This function exclusively uses the tags in the repo to determine whether a release has bee done or not.
 *
 * @internal
 */
export async function isReleased(
	context: Context,
	releaseGroupOrPackage: MonoRepo | Package | string,
	version: string,
	log?: Logger,
): Promise<boolean> {
	await context.gitRepo.fetchTags();

	const tagName = generateReleaseGitTagName(releaseGroupOrPackage, version);
	if (typeof releaseGroupOrPackage === "string" && isReleaseGroup(releaseGroupOrPackage)) {
		// eslint-disable-next-line no-param-reassign, @typescript-eslint/no-non-null-assertion
		releaseGroupOrPackage = context.repo.releaseGroups.get(releaseGroupOrPackage)!;
	}

	log?.verbose(`Checking for tag '${tagName}'`);
	const rawTag = await context.gitRepo.getTags(tagName);
	return rawTag.trim() === tagName;
}

/**
 * Generates the correct git tag name for the release of a given release group and version.
 *
 * @param releaseGroupOrPackage - The release group or independent package to generate a tag name for.
 * @param version - The version to use for the generated tag.
 * @returns The generated tag name.
 *
 * @internal
 */
export function generateReleaseGitTagName(
	releaseGroupOrPackage: MonoRepo | Package | string,
	version?: string,
): string {
	let tagName = "";

	if (releaseGroupOrPackage instanceof MonoRepo) {
		const kindLowerCase = releaseGroupOrPackage.kind.toLowerCase();
		tagName = `${kindLowerCase}_v${version ?? releaseGroupOrPackage.version}`;
	} else if (releaseGroupOrPackage instanceof Package) {
		tagName = `${PackageName.getUnscopedName(releaseGroupOrPackage.name)}_v${
			version ?? releaseGroupOrPackage.version
		}`;
	} else {
		tagName = `${PackageName.getUnscopedName(releaseGroupOrPackage)}_v${version}`;
	}

	return tagName;
}

/**
 * Sorts an array of {@link ReleaseDetails} by version or date. The array will be cloned then sorted in place.
 *
 * @param versions - The array of versions to sort.
 * @param sortKey - The sort key.
 * @returns A sorted array.
 *
 * @internal
 */
export function sortVersions(
	versions: VersionDetails[],
	sortKey: "version" | "date",
): VersionDetails[] {
	const sortedVersions: VersionDetails[] = [];

	// Clone the array
	for (const item of versions) {
		sortedVersions.push(item);
	}

	if (sortKey === "version") {
		sortedVersions.sort((a, b) => semver.rcompare(a.version, b.version));
	} else {
		sortedVersions.sort((a, b) =>
			a.date === undefined || b.date === undefined ? -1 : compareDesc(a.date, b.date),
		);
	}

	return sortedVersions;
}

/**
 * Filters an array of {@link VersionDetails}, removing versions older than a specified number of business days.
 *
 * @param versions - The array of versions to filter.
 * @param numBusinessDays - The number of business days to consider recent.
 * @returns An array of versions that are more recent than numBusinessDays.
 */
export function filterVersionsOlderThan(
	versions: VersionDetails[],
	numBusinessDays: number,
): VersionDetails[] {
	return versions.filter((v) => {
		const diff = v.date === undefined ? 0 : differenceInBusinessDays(Date.now(), v.date);
		return diff <= numBusinessDays;
	});
}

/**
 * Gets the direct Fluid dependencies for a given package or release group. A Fluid dependency is a dependency on
 * other packages or release groups in the repo.
 *
 * @param context - The {@link Context}.
 * @param releaseGroupOrPackage - The release group or package to check.
 * @returns A tuple of {@link PackageVersionMap} objects, one of which contains release groups on which the package
 * depends, and the other contains independent packages on which the package depends.
 *
 * @internal
 */
export function getFluidDependencies(
	context: Context,
	releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
): [releaseGroups: PackageVersionMap, packages: PackageVersionMap] {
	const releaseGroups: PackageVersionMap = {};
	const packages: PackageVersionMap = {};
	let packagesToCheck: Package[];

	if (isReleaseGroup(releaseGroupOrPackage)) {
		packagesToCheck = context.packagesInReleaseGroup(releaseGroupOrPackage);
	} else {
		const independentPackage = context.fullPackageMap.get(releaseGroupOrPackage);
		assert(
			independentPackage !== undefined,
			`Package not found in context: ${releaseGroupOrPackage}`,
		);
		packagesToCheck = [independentPackage];
	}

	for (const p of packagesToCheck) {
		for (const dep of p.combinedDependencies) {
			const pkg = context.fullPackageMap.get(dep.name);
			if (pkg === undefined) {
				continue;
			}

			const minVer = semver.minVersion(dep.version);
			if (minVer === null) {
				throw new Error(`Failed to parse depVersion: ${dep.version}`);
			}

			if (pkg.monoRepo !== undefined) {
				releaseGroups[pkg.monoRepo.kind] = minVer.version;
				continue;
			}

			packages[pkg.name] = minVer.version;
		}
	}

	return [releaseGroups, packages];
}
