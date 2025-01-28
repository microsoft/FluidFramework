/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	InterdependencyRange,
	ReleaseVersion,
	detectVersionScheme,
	getVersionRange,
	isInterdependencyRange,
	isInternalVersionRange,
	isPrereleaseVersion,
	isRangeOperator,
	isWorkspaceRange,
} from "@fluid-tools/version-tools";
import {
	Logger,
	MonoRepo,
	Package,
	type PackageJson,
	updatePackageJsonFile,
} from "@fluidframework/build-tools";
import { PackageName } from "@rushstack/node-core-library";
import { compareDesc, differenceInBusinessDays } from "date-fns";
import execa from "execa";
import { readJson, readJsonSync } from "fs-extra/esm";
import JSON5 from "json5";
import latestVersion from "latest-version";
import ncu from "npm-check-updates";
import type { Index } from "npm-check-updates/build/src/types/IndexType.js";
import type { VersionSpec } from "npm-check-updates/build/src/types/VersionSpec.js";
import * as semver from "semver";

import type { TsConfigJson } from "type-fest";
import {
	AllPackagesSelectionCriteria,
	PackageSelectionCriteria,
	PackageWithKind,
	selectAndFilterPackages,
} from "../filter.js";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../releaseGroups.js";
import { DependencyUpdateType } from "./bump.js";
import { zip } from "./collections.js";
import { Context, VersionDetails } from "./context.js";
import { indentString } from "./text.js";

/**
 * An object that maps package names to version strings or range strings.
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
 */
// eslint-disable-next-line max-params
export async function npmCheckUpdates(
	context: Context,
	releaseGroup: ReleaseGroup | ReleasePackage | undefined,
	depsToUpdate: ReleasePackage[] | RegExp[],
	releaseGroupFilter: ReleaseGroup | undefined,
	depUpdateType: DependencyUpdateType,
	prerelease = false,
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
		const result = (await ncu.run({
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const { name } = readJsonSync(jsonPath);
				const pkg = context.fullPackageMap.get(name as string);
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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const { name } = readJsonSync(jsonPath);
			const pkg = context.fullPackageMap.get(name as string);
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
 * @param releaseGroup - The release group or package.
 * @returns A {@link PreReleaseDependencies} object containing the pre-release dependency names and versions.
 */
export async function getPreReleaseDependencies(
	context: Context,
	releaseGroup: ReleaseGroup | ReleasePackage | MonoRepo | Package,
): Promise<PreReleaseDependencies> {
	const prereleasePackages = new Map<ReleasePackage, string>();
	const prereleaseGroups = new Map<ReleaseGroup, string>();
	const packagesToCheck: Package[] = [];

	/**
	 * Array of package names; dependencies on these packages will be updated.
	 */
	const updateDependenciesOnThesePackages: ReleasePackage[] = [];

	if (releaseGroup instanceof Package) {
		packagesToCheck.push(releaseGroup);
		updateDependenciesOnThesePackages.push(
			...context.packagesNotInReleaseGroup(releaseGroup).map((p) => p.name),
		);
	} else if (releaseGroup instanceof MonoRepo || isReleaseGroup(releaseGroup)) {
		const monorepo =
			releaseGroup instanceof MonoRepo
				? releaseGroup
				: context.repo.releaseGroups.get(releaseGroup);
		if (monorepo === undefined) {
			throw new Error(
				`Can't find release group in context: ${
					releaseGroup instanceof MonoRepo ? releaseGroup.name : releaseGroup
				}`,
			);
		}

		packagesToCheck.push(...monorepo.packages);
		updateDependenciesOnThesePackages.push(
			...context.packagesNotInReleaseGroup(monorepo.name).map((p) => p.name),
		);
	} else {
		assert(typeof releaseGroup === "string");
		const pkg = context.fullPackageMap.get(releaseGroup);
		if (pkg === undefined) {
			throw new Error(`Can't find package in context: ${releaseGroup}`);
		}

		packagesToCheck.push(pkg);
		updateDependenciesOnThesePackages.push(
			...context.packagesNotInReleaseGroup(pkg).map((p) => p.name),
		);
	}

	for (const pkg of packagesToCheck) {
		for (const { name: depName, version: depVersion } of pkg.combinedDependencies) {
			// If it's not a dep we're looking to update, skip to the next dep
			if (!updateDependenciesOnThesePackages.includes(depName)) {
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
					prereleaseGroups.set(depPkg.monoRepo.releaseGroup, depVersion);
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
 */
export async function isReleased(
	context: Context,
	releaseGroupOrPackage: MonoRepo | Package | string,
	version: string,
	log?: Logger,
): Promise<boolean> {
	const gitRepo = await context.getGitRepository();
	await gitRepo.gitClient.fetch(["--tags"]);

	const tagName = generateReleaseGitTagName(releaseGroupOrPackage, version);
	if (typeof releaseGroupOrPackage === "string" && isReleaseGroup(releaseGroupOrPackage)) {
		// eslint-disable-next-line no-param-reassign, @typescript-eslint/no-non-null-assertion
		releaseGroupOrPackage = context.repo.releaseGroups.get(releaseGroupOrPackage)!;
	}

	log?.verbose(`Checking for tag '${tagName}'`);
	const rawTag = await gitRepo.gitClient.tags({ list: tagName });
	return rawTag.all?.[0] === tagName;
}

/**
 * Generates the correct git tag name for the release of a given release group and version.
 *
 * @param releaseGroupOrPackage - The release group or independent package to generate a tag name for.
 * @param version - The version to use for the generated tag.
 * @returns The generated tag name.
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

			// If the dependency is a workspace dependency, then we need to use the current version of the package as the dep
			// range. Otherwise pick the minimum version the range represents.
			const newVersion = dep.version.startsWith("workspace:")
				? semver.parse(pkg.version)
				: semver.minVersion(dep.version);
			if (newVersion === null) {
				throw new Error(`Failed to parse depVersion: ${dep.version}`);
			}

			if (pkg.monoRepo !== undefined) {
				releaseGroups[pkg.monoRepo.kind] = newVersion.version;
				continue;
			}

			packages[pkg.name] = newVersion.version;
		}
	}

	return [releaseGroups, packages];
}

export interface DependencyWithRange {
	pkg: Package;
	range: InterdependencyRange;
}

/**
 * Sets the version of a release group or standalone package.
 *
 * @param context - The {@link Context}.
 * @param releaseGroupOrPackage - A release group repo or package to bump.
 * @param version - The version to set.
 * @param interdependencyRange - The type of dependency to use on packages within the release group.
 * @param writeChanges - If true, save changes to packages to disk.
 * @param log - A logger to use.
 */
export async function setVersion(
	context: Context,
	releaseGroupOrPackage: MonoRepo | Package,
	version: semver.SemVer,
	interdependencyRange: InterdependencyRange = "^",
	log?: Logger,
): Promise<void> {
	const translatedVersion = version;
	const scheme = detectVersionScheme(translatedVersion);

	const { name } = releaseGroupOrPackage;
	const cmds: [string, string[], execa.Options | undefined][] = [];
	let options: execa.Options | undefined;

	// Run npm version in each package to set its version in package.json. Also regenerates packageVersion.ts if needed.
	if (releaseGroupOrPackage instanceof MonoRepo) {
		options = {
			cwd: releaseGroupOrPackage.repoPath,
			stdio: "inherit",
			shell: true,
		};
		cmds.push(
			[
				`flub`,
				[
					`exec`,
					"-g",
					name,
					"--",
					`"npm version ${translatedVersion.version} --allow-same-version"`,
				],
				options,
			],
			["pnpm", ["-r", "run", "build:genver"], options],
		);
	} else {
		options = {
			cwd: releaseGroupOrPackage.directory,
			stdio: "inherit",
			shell: true,
		};
		cmds.push([
			`npm`,
			["version", translatedVersion.version, "--allow-same-version"],
			options,
		]);
		if (releaseGroupOrPackage.getScript("build:genver") !== undefined) {
			cmds.push([`npm`, ["run", "build:genver"], options]);
		}
	}

	for (const [cmd, args, opts] of cmds) {
		log?.verbose(`Running command: ${cmd} ${args} in ${opts?.cwd}`);
		try {
			// TODO: The shell option should not need to be true. AB#4067
			// eslint-disable-next-line no-await-in-loop
			const results = await execa(cmd, args, options);
			if (results.all !== undefined) {
				log?.verbose(results.all);
			}
		} catch (error: unknown) {
			log?.errorLog(`Error running command: ${cmd} ${args}\n${error}`);
			throw error;
		}
	}

	if (releaseGroupOrPackage instanceof Package) {
		// Return early; packages only need to be bumped using npm. The rest of the logic is only for release groups.
		return;
	}

	// Since we don't use lerna to bump, manually updates the lerna.json file. Also updates the root package.json for good
	// measure. Long term we may consider removing lerna.json and using the root package version as the "source of truth".
	const lernaPath = path.join(releaseGroupOrPackage.repoPath, "lerna.json");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const lernaJson = await readJson(lernaPath);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	lernaJson.version = translatedVersion.version;
	const output = JSON.stringify(lernaJson);
	await writeFile(lernaPath, output);

	updatePackageJsonFile(path.join(releaseGroupOrPackage.repoPath, "package.json"), (json) => {
		json.version = translatedVersion.version;
	});

	context.repo.reload();

	// The package versions have been updated, so now we update the dependency ranges for packages within the release
	// group. We need to account for Fluid internal versions and the requested interdependencyRange.
	let newRange: string | undefined;

	if (isWorkspaceRange(interdependencyRange)) {
		newRange = interdependencyRange;
	} // Fluid internal versions that use ~ or ^ need to be translated to >= < ranges.
	else if (["internal", "internalPrerelease"].includes(scheme)) {
		if (isRangeOperator(interdependencyRange)) {
			newRange =
				// If the interdependencyRange is the empty string, it means we should use an exact dependency on the version, so
				// we set the range to the version. Otherwise, since this is a Fluid internal version, we need to calculate an
				// appropriate range string based on the interdependencyRange.
				interdependencyRange === ""
					? translatedVersion.version
					: getVersionRange(translatedVersion, interdependencyRange);
		} else {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			newRange = `${interdependencyRange}${translatedVersion.version}`;
		}
	} else {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		newRange = `${interdependencyRange}${translatedVersion.version}`;
	}

	if (
		newRange !== undefined &&
		isInternalVersionRange(newRange, true) === false &&
		!isInterdependencyRange(newRange)
	) {
		throw new Error(`New range is invalid: ${newRange}`);
	}

	const packagesToCheckAndUpdate = releaseGroupOrPackage.packages;
	const dependencyVersionMap = new Map<string, DependencyWithRange>();
	for (const pkg of packagesToCheckAndUpdate) {
		dependencyVersionMap.set(pkg.name, { pkg, range: newRange as InterdependencyRange });
	}

	for (const pkg of packagesToCheckAndUpdate) {
		// eslint-disable-next-line no-await-in-loop
		await setPackageDependencies(
			pkg,
			dependencyVersionMap,
			/* updateWithinSameReleaseGroup */ true,
			/* writeChanges */ true,
		);
	}

	try {
		// TODO: The shell option should not need to be true. AB#4067
		const results = await execa("pnpm", ["run", "format"], options);
		if (results.all !== undefined) {
			log?.verbose(results.all);
		}
	} catch (error: unknown) {
		log?.errorLog(`Error running command: pnpm run format\n${error}`);
		throw error;
	}
}

/**
 * Extracts the dependencies record from a package.json file based on the dependency group.
 */
function getDependenciesRecord(
	packageJson: PackageJson,
	depClass: "prod" | "dev" | "peer",
): PackageJson["dependencies" | "devDependencies" | "peerDependencies"] | undefined {
	switch (depClass) {
		case "dev": {
			return packageJson.devDependencies;
		}
		case "peer": {
			return packageJson.peerDependencies;
		}
		default: {
			return packageJson.dependencies;
		}
	}
}

/**
 * Set the version of _dependencies_ within a package according to the provided map of packages to range strings.
 *
 * @param pkg - The package whose dependencies should be updated.
 * @param dependencyVersionMap - A Map of dependency names to a range string.
 * @param updateWithinSameReleaseGroup - If true, will update dependency ranges of dependencies within the same release
 * group. Typically this should be `false`, but in some cases you may need to set a precise dependency range string
 * within the same release group.
 * @param writeChanges - If true, save changes to packages to disk.
 * @returns True if the packages dependencies were changed; false otherwise.
 *
 * @remarks
 * By default, dependencies on packages within the same release group -- we call these interdependencies --
 * will not be changed (`updateWithinSameReleaseGroup === false`). This is typically the behavior you want. However,
 * there are some cases where you need to forcefully change the dependency range of packages across the whole repo. For
 * example, when setting release group package versions in the CI release pipeline.
 */
async function setPackageDependencies(
	pkg: Package,
	dependencyVersionMap: Map<string, DependencyWithRange>,
	updateWithinSameReleaseGroup = false,
	writeChanges = true,
): Promise<boolean> {
	let changed = false;
	let newRangeString: string;
	for (const { name, depClass } of pkg.combinedDependencies) {
		const dep = dependencyVersionMap.get(name);
		if (dep !== undefined) {
			const isSameReleaseGroup = MonoRepo.isSame(dep.pkg.monoRepo, pkg.monoRepo);
			if (!isSameReleaseGroup || (updateWithinSameReleaseGroup && isSameReleaseGroup)) {
				const dependencies = getDependenciesRecord(pkg.packageJson, depClass);
				if (dependencies === undefined) {
					continue;
				}

				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				newRangeString = dep.range.toString();
				if (dependencies[name] === "workspace:~") {
					changed = true;
					dependencies[name] = newRangeString;
				}
			}
		}
	}

	if (changed && writeChanges) {
		await pkg.savePackageJson();
	}

	return changed;
}

async function findDepUpdates(
	dependencies: ReleasePackage[],
	prerelease: boolean,
	log?: Logger,
): Promise<PackageVersionMap> {
	/**
	 * A map of packages that should be updated, and their latest version.
	 */
	const dependencyVersionMap: PackageVersionMap = {};

	// Get the new version for each package based on the update type
	for (const pkgName of dependencies) {
		let latest: string;
		let dev: string;

		try {
			// eslint-disable-next-line no-await-in-loop
			[latest, dev] = await Promise.all([
				latestVersion(pkgName, {
					version: "latest",
				}),
				latestVersion(pkgName, {
					version: "dev",
				}),
			]);
		} catch (error: unknown) {
			log?.warning(error as Error);
			continue;
		}

		// If we're allowing pre-release, use the version that has the 'dev' dist-tag in npm. Warn if it is lower than the 'latest'.
		if (prerelease) {
			dependencyVersionMap[pkgName] = dev;
			if (semver.gt(latest, dev)) {
				log?.warning(
					`The 'latest' dist-tag is version ${latest}, which is greater than the 'dev' dist-tag version, ${dev}. Is this expected?`,
				);
			}
		} else {
			dependencyVersionMap[pkgName] = latest;
		}
	}

	return dependencyVersionMap;
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
 * @param prerelease - If true, include prerelease versions as eligible to update.
 * @param writeChanges - If true, changes will be written to the package.json files.
 * @param log - A {@link Logger}.
 * @returns An array of packages that had updated dependencies.
 */
// eslint-disable-next-line max-params
export async function npmCheckUpdatesHomegrown(
	context: Context,
	releaseGroup: ReleaseGroup | ReleasePackage | undefined,
	depsToUpdate: ReleasePackage[],
	releaseGroupFilter: ReleaseGroup | undefined,
	prerelease = false,
	writeChanges = true,
	log?: Logger,
): Promise<{
	updatedPackages: PackageWithKind[];
	updatedDependencies: PackageVersionMap;
}> {
	if (releaseGroupFilter !== undefined && releaseGroup === releaseGroupFilter) {
		throw new Error(
			`releaseGroup and releaseGroupFilter are the same (${releaseGroup}). They must be different values.`,
		);
	}
	log?.info(`Calculating dependency updates...`);

	/**
	 * A map of packages that should be updated, and their latest version.
	 */
	const dependencyVersionMap = await findDepUpdates(depsToUpdate, prerelease, log);
	log?.verbose(
		`Dependencies to update:\n${JSON.stringify(dependencyVersionMap, undefined, 2)}`,
	);

	log?.info(`Determining packages to update...`);
	const selectionCriteria: PackageSelectionCriteria =
		releaseGroup === undefined
			? // if releaseGroup is undefined it means we should update all packages and release groups
				AllPackagesSelectionCriteria
			: {
					independentPackages: false,
					releaseGroups: [releaseGroup as ReleaseGroup],
					releaseGroupRoots: [releaseGroup as ReleaseGroup],
				};

	// Remove the filtered release group from the list if needed
	if (releaseGroupFilter !== undefined) {
		const indexOfFilteredGroup = selectionCriteria.releaseGroups.indexOf(releaseGroupFilter);
		if (indexOfFilteredGroup !== -1) {
			selectionCriteria.releaseGroups.splice(indexOfFilteredGroup, 1);
			selectionCriteria.releaseGroupRoots.splice(indexOfFilteredGroup, 1);
		}
	}

	const { filtered: packagesToUpdate } = await selectAndFilterPackages(
		context,
		selectionCriteria,
	);
	log?.info(
		`Found ${Object.keys(dependencyVersionMap).length} dependencies to update across ${
			packagesToUpdate.length
		} packages.`,
	);

	const dependencyUpdateMap = new Map<string, DependencyWithRange>();

	const versionSet = new Set<string>(Object.values(dependencyVersionMap));
	if (versionSet.size !== 1) {
		throw new Error(
			`Expected all the latest versions of the dependencies to match, but they don't. Unique versions: ${JSON.stringify(
				versionSet,
				undefined,
				2,
			)}`,
		);
	}

	const verString = [...versionSet][0];
	const newVersion = semver.parse(verString);
	if (newVersion === null) {
		throw new Error(`Couldn't parse version ${verString}`);
	}

	const range: InterdependencyRange = prerelease ? newVersion : `^${[...versionSet][0]}`;
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	log?.verbose(`Calculated new range: ${range}`);
	for (const dep of Object.keys(dependencyVersionMap)) {
		const pkg = context.fullPackageMap.get(dep);

		if (pkg === undefined) {
			log?.warning(`Package not found: ${dep}. Skipping.`);
			continue;
		}

		dependencyUpdateMap.set(dep, { pkg, range });
	}

	const promises: Promise<boolean>[] = [];
	for (const pkg of packagesToUpdate) {
		promises.push(setPackageDependencies(pkg, dependencyUpdateMap, false, writeChanges));
	}
	const results = await Promise.all(promises);
	const packageStatus = zip(packagesToUpdate, results);
	const updatedPackages = packageStatus
		.filter(([, changed]) => changed === true)
		.map(([pkg]) => pkg);

	log?.info(`Updated ${updatedPackages.length} of ${packagesToUpdate.length} packages.`);

	return {
		updatedDependencies: dependencyVersionMap,
		updatedPackages,
	};
}

/**
 * Checks the package object to verify that the specified devDependency exists.
 *
 * @param packageObject - the package.json object to check for the dependency
 * @param dependencyName - the dependency to check for in the package object
 * @returns The version of the dependency in package.json.
 */
export function ensureDevDependencyExists(
	packageObject: PackageJson,
	dependencyName: string,
): string {
	const dependencyVersion = packageObject?.devDependencies?.[dependencyName];
	if (dependencyVersion === undefined) {
		throw new Error(`Did not find devDependency '${dependencyName}' in package.json`);
	}
	return dependencyVersion;
}

/**
 * Returns the "tarball name" for a package. This is the name that 'npm pack' uses for the tarball it creates when run,
 * NOT including version or file extension.
 *
 * @param pkg - The package.json for the package.
 * @returns The package name portion of the full package tarball name.
 *
 * @see {@link getFullTarballName} for a version of this function that includes the package version and file extension.
 */
export function getTarballName(pkg: PackageJson | string): string {
	const pkgName = typeof pkg === "string" ? pkg : pkg.name;
	const name = pkgName.replaceAll("@", "").replaceAll("/", "-");
	return name;
}

/**
 * Returns the "tarball name" for a package. This is the name that 'npm pack' uses for the tarball it creates when run,
 * including the version and file extension.
 *
 * @param pkg - The package.json for the package.
 * @returns The full tarball name including version and file extension.
 *
 * @see {@link getTarballName} for a version of this function that does not include the package version and file extension.
 */
export function getFullTarballName(pkg: PackageJson): string {
	return `${getTarballName(pkg)}-${pkg?.version ?? 0}.tgz`;
}

/**
 * Reads and parses the `package.json` file in the current directory.
 * Use this function if you prefer the CLI command not to be implemented as `PackageCommand`command.
 */
export async function readPackageJson(): Promise<PackageJson> {
	const packageJson = await readFile("./package.json", { encoding: "utf8" });
	return JSON.parse(packageJson) as PackageJson;
}

// Reads and parses the `tsconfig.json` file in the current directory.
export async function readTsConfig(): Promise<TsConfigJson> {
	const tsConfigContent = await readFile("./tsconfig.json", { encoding: "utf8" });
	return JSON5.parse(tsConfigContent);
}
