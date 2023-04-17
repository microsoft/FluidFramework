/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import path from "node:path";
import execa from "execa";
import { writeFile, readJson } from "fs-extra";
import { format as prettier, resolveConfig as resolvePrettierConfig } from "prettier";
import * as semver from "semver";

import {
	Context,
	MonoRepo,
	Logger,
	Package,
	VersionBag,
	updatePackageJsonFile,
} from "@fluidframework/build-tools";
import {
	VersionChangeType,
	VersionScheme,
	bumpRange,
	bumpVersionScheme,
	getVersionRange,
	isVersionBumpType,
	isVersionBumpTypeExtended,
} from "@fluid-tools/version-tools";

/**
 * A type representing the types of dependency updates that can be done. This type is intended to match the type
 * npm-check-updates uses for its `target` argument.
 */
export type DependencyUpdateType =
	| "latest"
	| "newest"
	| "greatest"
	| "minor"
	| "patch"
	| `@${string}`;

/**
 * A type guard used to determine if a string is a DependencyUpdateType.
 *
 * @internal
 */
export function isDependencyUpdateType(str: string | undefined): str is DependencyUpdateType {
	if (str === undefined) {
		return false;
	}

	if (["latest", "newest", "greatest", "minor", "patch"].includes(str)) {
		return true;
	}

	return str.startsWith("@");
}

/**
 * A mapping of {@link Package} to a version range string or a bump type. This interface is used for convenience.
 *
 * @internal
 */
export interface PackageWithRangeSpec {
	pkg: Package;
	rangeOrBumpType: string;
}

/**
 * Bump the dependencies of a package according to the provided map of packages to bump types.
 *
 * @param pkg - The package whose dependencies should be bumped.
 * @param bumpPackageMap - A Map of package names to a {@link PackageWithRangeSpec} which contains the package and a
 * string that is either a range string or a bump type. If it is a range string, the dependency will be set to that
 * value. If it is a bump type, the dependency range will be bumped according to that type.
 * @param prerelease - If true, will bump to the next pre-release version given the bump type.
 * @param onlyBumpPrerelease - If true, only dependencies on pre-release packages will be bumped.
 * @param updateWithinSameReleaseGroup - If true, will update dependency ranges of deps within the same release group.
 * Generally this should be false, but in some cases you may need to set a precise dependency range string within the
 * same release group.
 * @param changedVersions - If provided, the changed packages will be put into this {@link VersionBag}.
 * @returns True if the packages dependencies were changed; false otherwise.
 *
 * @remarks
 *
 * By default, dependencies on packages within the same release group -- that is, intra-release-group dependencies --
 * will not be changed (`updateWithinSameReleaseGroup === false`). This is typically the behavior you want. However,
 * there are some cases where you need to forcefully change the dependency range of packages across the whole repo. For
 * example, when bumping packages using the Fluid internal version scheme, we need to adjust the dependency ranges that
 * lerna creates automatically, because the Fluid internal version scheme requires us to use \>= \< dependency ranges
 * instead of ^.
 *
 * @internal
 */
// eslint-disable-next-line max-params
export async function bumpPackageDependencies(
	pkg: Package,
	bumpPackageMap: Map<string, PackageWithRangeSpec>,
	prerelease: boolean,
	onlyBumpPrerelease: boolean,
	// eslint-disable-next-line default-param-last
	updateWithinSameReleaseGroup = false,
	changedVersions?: VersionBag,
) {
	let changed = false;
	let newRangeString: string;
	for (const { name, dev } of pkg.combinedDependencies) {
		const dep = bumpPackageMap.get(name);
		if (dep !== undefined) {
			const isSameReleaseGroup = MonoRepo.isSame(dep?.pkg.monoRepo, pkg.monoRepo);
			if (!isSameReleaseGroup || (updateWithinSameReleaseGroup && isSameReleaseGroup)) {
				const dependencies = dev
					? pkg.packageJson.devDependencies
					: pkg.packageJson.dependencies;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const verString = dependencies[name]!;
				const depIsPrerelease = (semver.minVersion(verString)?.prerelease?.length ?? 0) > 0;

				const depNewRangeOrBumpType = dep.rangeOrBumpType;
				// eslint-disable-next-line unicorn/prefer-ternary
				if (isVersionBumpTypeExtended(depNewRangeOrBumpType)) {
					// bump the current range string
					newRangeString = bumpRange(verString, depNewRangeOrBumpType, prerelease);
				} else {
					newRangeString = depNewRangeOrBumpType;
				}

				// If we're only bumping prereleases, check if the dep is a pre-release. Otherwise bump all packages
				// whose range doesn't match the current value.
				if (
					(onlyBumpPrerelease && depIsPrerelease) ||
					dependencies[name] !== newRangeString
				) {
					changed = true;
					dependencies[name] = newRangeString;
					changedVersions?.add(dep.pkg, newRangeString);
				}
			}
		}
	}

	if (changed) {
		await pkg.savePackageJson();
	}

	return changed;
}

/**
 * Bumps a release group or standalone package by the bumpType.
 *
 * @param context - The {@link Context}.
 * @param bumpType - The bump type. Can be a SemVer object to set an exact version.
 * @param releaseGroupOrPackage - A release group repo or package to bump.
 * @param scheme - The version scheme to use.
 * @param exactDependencyType - The type of dependency to use on packages within the release group.
 * @param log - A logger to use.
 *
 * @internal
 */
// eslint-disable-next-line max-params
export async function bumpReleaseGroup(
	context: Context,
	bumpType: VersionChangeType,
	releaseGroupOrPackage: MonoRepo | Package,
	scheme?: VersionScheme,
	// eslint-disable-next-line default-param-last
	exactDependencyType: "~" | "^" | "" = "^",
	log?: Logger,
): Promise<void> {
	const translatedVersion = isVersionBumpType(bumpType)
		? bumpVersionScheme(releaseGroupOrPackage.version, bumpType, scheme)
		: bumpType;

	let name: string;
	const cmds: [string, string[], execa.Options | undefined][] = [];
	let options: execa.Options | undefined;

	// Run npm version in each package to set its version in package.json. Also regenerates packageVersion.ts if needed.
	if (releaseGroupOrPackage instanceof MonoRepo) {
		name = releaseGroupOrPackage.kind;
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
		name = releaseGroupOrPackage.name;
		options = {
			cwd: releaseGroupOrPackage.directory,
			stdio: "inherit",
			shell: true,
		};
		cmds.push([`npm`, ["version", translatedVersion.version, "--allow-same-version"], options]);
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
		} catch (error: any) {
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
	const [lernaJson, prettierConfig] = await Promise.all([
		readJson(lernaPath),
		resolvePrettierConfig(lernaPath),
	]);

	if (prettierConfig !== null) {
		prettierConfig.filepath = lernaPath;
	}
	lernaJson.version = translatedVersion.version;
	const output = prettier(
		JSON.stringify(lernaJson),
		prettierConfig === null ? undefined : prettierConfig,
	);
	await writeFile(lernaPath, output);

	updatePackageJsonFile(path.join(releaseGroupOrPackage.repoPath, "package.json"), (json) => {
		json.version = translatedVersion.version;
	});

	context.repo.reload();

	// The package versions have been bumped, so now we update the dependency ranges for packages within the release
	// group. We need to account for Fluid internal versions and the requested exactDependencyType.
	let range: string;
	if (scheme === "internal" || scheme === "internalPrerelease") {
		range =
			exactDependencyType === ""
				? translatedVersion.version
				: getVersionRange(translatedVersion, exactDependencyType);
	} else {
		range = `${exactDependencyType}${translatedVersion.version}`;
	}

	const packagesToCheckAndUpdate = releaseGroupOrPackage.packages;
	const packageNewVersionMap = new Map<string, PackageWithRangeSpec>();
	for (const pkg of packagesToCheckAndUpdate) {
		packageNewVersionMap.set(pkg.name, { pkg, rangeOrBumpType: range });
	}

	for (const pkg of packagesToCheckAndUpdate) {
		// eslint-disable-next-line no-await-in-loop
		await bumpPackageDependencies(
			pkg,
			packageNewVersionMap,
			/* prerelease */ false,
			/* onlyBumpPrerelease */ false,
			/* updateWithinSameReleaseGroup */ true,
		);
	}
}
