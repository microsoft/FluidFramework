/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";
import * as fs from "fs";
import minimatch from "minimatch";
import * as semver from "semver";
import * as util from "util";

import {
	ReleaseVersion,
	VersionBumpType,
	fromInternalScheme,
	getPreviousVersions,
	getVersionRange,
	isInternalVersionScheme,
	isVersionBumpType,
	toInternalScheme,
} from "@fluid-tools/version-tools";

import { Context } from "../bumpVersion/context";
import { Logger, defaultLogger } from "../common/logging";
import { BrokenCompatTypes, PackageJson } from "../common/npmPackage";

export type PackageDetails = {
	readonly packageDir: string;
	readonly oldVersions: readonly string[];
	readonly broken: BrokenCompatTypes;
	readonly json: PackageJson;
};

function createSortedObject<T>(obj: Record<string, T>): Record<string, T> {
	const sortedKeys = Object.keys(obj).sort();
	const sortedDeps: Record<string, T> = {};
	for (const key of sortedKeys) {
		sortedDeps[key] = obj[key];
	}
	return sortedDeps;
}

function safeParse(json: string, error: string) {
	try {
		return JSON.parse(json);
	} catch {
		throw new Error(error);
	}
}

export async function getPackageDetails(packageDir: string): Promise<PackageDetails> {
	const packagePath = `${packageDir}/package.json`;
	if (!(await util.promisify(fs.exists)(packagePath))) {
		throw new Error(`Package json does not exist: ${packagePath}`);
	}
	const content = await util.promisify(fs.readFile)(packagePath);

	const pkgJson: PackageJson = safeParse(content.toString(), packagePath);

	const oldVersions: string[] = Object.keys(pkgJson.devDependencies ?? {}).filter((k) =>
		k.startsWith(pkgJson.name),
	);

	return {
		json: pkgJson,
		packageDir,
		oldVersions,
		broken: pkgJson.typeValidation?.broken ?? {},
	};
}

/**
 * A type representing the different version constraint styles we use when determining the previous version for type
 * test generation.
 *
 * The "base" versions are calculated by zeroing out all version segments lower than the base. That is, for a version v,
 * the baseMajor version is `${v.major}.0.0` and the baseMinor version is `${v.major}.${v.minor}.0`.
 *
 * The "previous" versions work similarly, but the major/minor/patch segment is reduced by 1. That is, for a version v,
 * the previousMajor version is `${min(v.major - 1, 1)}.0.0`, the previousMinor version is
 * `${v.major}.${min(v.minor - 1, 0)}.0`, and the previousPatch is `${v.major}.${v.minor}.${min(v.patch - 1, 0)}.0`.
 *
 * The "previous" versions never roll back below 1 for the major version and 0 for minor and patch. That is, the
 * previousMajor, previousMinor, and previousPatch versions for `1.0.0` are all `1.0.0`.
 *
 * @example
 *
 * Given the version 2.3.5:
 *
 * baseMajor: 2.0.0
 * baseMinor: 2.3.0
 * ~baseMinor: ~2.3.0
 * previousPatch: 2.3.4
 * previousMinor: 2.2.0
 * previousMajor: 1.0.0
 * ^previousMajor: ^1.0.0
 * ^previousMinor: ^2.2.0
 * ~previousMajor: ~1.0.0
 * ~previousMinor: ~2.2.0
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.3.5:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.3.0
 * ~baseMinor: >=2.0.0-internal.2.3.0 <2.0.0-internal.3.0.0
 * previousPatch: 2.0.0-internal.2.3.4
 * previousMinor: 2.0.0-internal.2.2.0
 * previousMajor: 2.0.0-internal.1.0.0
 * ^previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0
 * ^previousMinor: >=2.0.0-internal.2.2.0 <2.0.0-internal.3.0.0
 * ~previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0
 * ~previousMinor: >=2.0.0-internal.2.2.0 <2.0.0-internal.2.2.0
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.0.0:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.0.0
 * ~baseMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0
 * previousPatch: 2.0.0-internal.2.0.0
 * previousMinor: 2.0.0-internal.2.0.0
 * previousMajor: 2.0.0-internal.1.0.0
 * ^previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0
 * ^previousMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0
 * ~previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0
 * ~previousMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0
 *
 * @internal
 */
export type PreviousVersionStyle =
	| "baseMajor"
	| "baseMinor"
	| "previousPatch"
	| "previousMinor"
	| "previousMajor"
	| "~baseMinor"
	| "^previousMajor"
	| "^previousMinor"
	| "~previousMajor"
	| "~previousMinor";

/**
 * Calculates the correct version baseline to use for typetests based on the {@link PreviousVersionStyle}.
 *
 * @param version - The version.
 * @param style - The version style to calculate.
 * @returns A valid semver version range for the previous version.
 */
function getPreviousVersionBaseline(version: ReleaseVersion, style: PreviousVersionStyle): string {
	const [previousMajorVersion, previousMinorVersion, previousPatchVersion] =
		getPreviousVersions(version);
	let prevVersion: string;

	switch (style) {
		case "baseMajor": {
			const sv = semver.parse(version);
			if (sv === null) {
				throw new Error(`Cannot parse current version: ${version}`);
			}

			if (isInternalVersionScheme(sv)) {
				const [pubVer, intVer] = fromInternalScheme(sv);
				prevVersion = toInternalScheme(pubVer, `${intVer.major}.0.0`).version;
			} else {
				prevVersion = `${sv.major}.0.0`;
			}
			break;
		}

		case "baseMinor": {
			const sv = semver.parse(version);
			if (sv === null) {
				throw new Error(`Cannot parse current version: ${version}`);
			}

			if (isInternalVersionScheme(sv)) {
				const [pubVer, intVer] = fromInternalScheme(sv);
				prevVersion = toInternalScheme(pubVer, `${intVer.major}.${intVer.minor}.0`).version;
			} else {
				prevVersion = `${sv.major}.${sv.minor}.0`;
			}

			break;
		}

		case "~baseMinor": {
			const sv = semver.parse(version);
			if (sv === null) {
				throw new Error(`Cannot parse current version: ${version}`);
			}

			if (isInternalVersionScheme(sv)) {
				const [pubVer, intVer] = fromInternalScheme(sv);
				const baseMinor = toInternalScheme(pubVer, `${intVer.major}.${intVer.minor}.0`);
				prevVersion = getVersionRange(baseMinor, "~");
			} else {
				prevVersion = `~${sv.major}.${sv.minor}.0`;
			}

			break;
		}

		case "previousMajor": {
			if (previousMajorVersion === undefined) {
				throw new Error(`Previous major version is undefined.`);
			}

			prevVersion = previousMajorVersion;
			break;
		}

		case "previousMinor": {
			if (previousMinorVersion === undefined) {
				throw new Error(`Previous minor version is undefined.`);
			}

			prevVersion = previousMinorVersion;
			break;
		}

		case "previousPatch": {
			if (previousPatchVersion === undefined) {
				throw new Error(`Previous patch version is undefined.`);
			}

			prevVersion = previousPatchVersion;
			break;
		}

		case "^previousMajor": {
			if (previousMajorVersion === undefined) {
				throw new Error(`Previous major version is undefined.`);
			}

			prevVersion = isInternalVersionScheme(previousMajorVersion)
				? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				  getVersionRange(previousMajorVersion!, "^")
				: `^${previousMajorVersion}`;
			break;
		}

		case "^previousMinor": {
			if (previousMinorVersion === undefined) {
				throw new Error(`Previous minor version is undefined.`);
			}

			prevVersion = isInternalVersionScheme(previousMinorVersion)
				? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				  getVersionRange(previousMinorVersion!, "^")
				: `^${previousMinorVersion}`;
			break;
		}

		case "~previousMajor": {
			if (previousMajorVersion === undefined) {
				throw new Error(`Previous major version is undefined.`);
			}

			prevVersion = isInternalVersionScheme(previousMajorVersion)
				? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				  getVersionRange(previousMajorVersion!, "~")
				: `~${previousMajorVersion}`;
			break;
		}

		case "~previousMinor": {
			if (previousMinorVersion === undefined) {
				throw new Error(`Previous minor version is undefined.`);
			}

			prevVersion = isInternalVersionScheme(previousMinorVersion)
				? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				  getVersionRange(previousMinorVersion!, "~")
				: `~${previousMinorVersion}`;
			break;
		}

		default: {
			throw new Error(`Unexpected previousVersionStyle: ${style}`);
		}
	}

	return prevVersion;
}

/**
 * Based on the current version of the package as per package.json, determines the previous version that we should run
 * typetests against.
 *
 * The version used for the previous version can be adjusted by passing different "style" values in via the
 * previousVersionStyle parameter.
 *
 * @param context - The repo {@link Context}.
 * @param packageDir - The path to the package.
 * @param writeUpdates - If true, will update the package.json with new previous versions.
 * @param style - The version style to use when determining the previous version. Can be the exact
 * previous major or minor versions, or caret/tilde-equivalent dependency ranges on those previous versions. If this
 * is undefined, then the style will be set according to the branchReleaseTypes defined in package.json.
 * @param branchName - If provided, this branch name will be used to set the previous version style according to the
 * branchReleaseTypes defined in package.json. If undefined, then the current branch name will be used.
 * @param exactPreviousVersionString - If provided, this string will be used as the previous version string.
 * @param resetBroken - If true, clears the "broken" section of the type validation, effectively clearing all known
 * breaking changes.
 * @param pinRange - If true, the version used will be the maximum released version that matches the range. This
 * effectively pins the version to a specific version while allowing it to be updated manually as needed. This is
 * functionally similar to what a lockfile does, but this provides us with an extra level of control so we don't rely on
 * lockfiles (in which we have found bugs).
 * @param log - A {@link Logger} that will be used for logging. Uses {@link defaultLogger} by default.
 * @returns package metadata or a reason the package was skipped.
 *
 * @internal
 */
export async function getAndUpdatePackageDetails(
	context: Context,
	packageDir: string,
	writeUpdates: boolean | undefined,
	style?: PreviousVersionStyle,
	branchName?: string,
	exactPreviousVersionString?: string,
	resetBroken?: boolean,
	pinRange = false,
	log: Logger = defaultLogger,
): Promise<(PackageDetails & { skipReason?: undefined }) | { skipReason: string }> {
	const packageDetails = await getPackageDetails(packageDir);
	const pkg = context.fullPackageMap.get(packageDetails.json.name);
	if (pkg === undefined) {
		return { skipReason: "Skipping package: not found in repo" };
	} else if (packageDetails.json.name.startsWith("@fluid-internal")) {
		// @fluid-internal packages are intended for internal use only and are not typically published. We don't make
		// compatibility promises for them, so they're excluded from type tests.
		return { skipReason: "Skipping package: @fluid-internal" };
	} else if (packageDetails.json.main?.endsWith("index.js") !== true) {
		// An index.js main entrypoint is required for type tests to be enabled.
		return { skipReason: "Skipping package: no index.js in main property" };
	} else if (packageDetails.json.private === true) {
		// Private packages aren't published, so no need to do type testing for them.
		return { skipReason: "Skipping package: private package" };
	} else if (packageDetails.json.typeValidation?.disabled === true) {
		// Packages can explicitly opt out of type tests by setting typeValidation.disabled to true.
		return { skipReason: "Skipping package: type validation disabled" };
	}

	const releaseGroup = pkg.monoRepo?.kind;
	if (
		(releaseGroup === undefined || pkg.monoRepo === undefined) &&
		pkg.fluidBuildConfig?.branchReleaseTypes === undefined
	) {
		return {
			skipReason: `Skipping package: has no release group and no branch release type config in package.json: ${pkg.name}`,
		};
	}

	const version = packageDetails.json.version;
	const cachedPreviousVersionStyle = packageDetails.json.typeValidation?.previousVersionStyle;
	const fluidConfig = pkg.monoRepo?.fluidBuildConfig ?? pkg.fluidBuildConfig;
	const branch = branchName ?? context.originalBranchName;
	let releaseType: VersionBumpType | undefined;
	let previousVersionStyle: PreviousVersionStyle | undefined;

	// the semver library uses null instead of undefined
	let pinnedVersion: string | null = null;

	if (fluidConfig !== undefined) {
		const releaseTypes = fluidConfig.branchReleaseTypes;
		if (releaseTypes === undefined) {
			return {
				skipReason: `Release group has no branchReleaseTypes defined: ${pkg.monoRepo?.kind}`,
			};
		}

		for (const [branchPattern, branchReleaseType] of Object.entries(releaseTypes)) {
			if (minimatch(branch, branchPattern)) {
				// The config can be either a VersionBumpType (major/minor/patch) which will be used to calculate the
				// previous version or a PreviousVersionStyle that will used as-is.
				if (isVersionBumpType(branchReleaseType)) {
					releaseType = branchReleaseType;
				} else {
					previousVersionStyle = branchReleaseType;
				}
			}
		}
	}

	previousVersionStyle =
		// If the style was explicitly passed in, use it
		style ??
		// If the branch config has a configured version style, use it
		previousVersionStyle ??
		// Otherwise calculate the version style based on the branch config
		(releaseType === "major"
			? "^previousMajor"
			: releaseType === "minor"
			? "~previousMinor"
			: releaseType === "patch"
			? "previousPatch"
			: undefined) ??
		// Finally if the branch is unknown, use the cached version style from the package.json
		cachedPreviousVersionStyle;

	if (previousVersionStyle === undefined) {
		// Skip if there's no previous version style defined for the package.
		return {
			skipReason: `Skipping package: no previousVersionStyle is defined`,
		};
	}

	const baseline = getPreviousVersionBaseline(version, previousVersionStyle);
	if (
		pinRange &&
		(previousVersionStyle?.startsWith("~") || previousVersionStyle?.startsWith("^"))
	) {
		const name = pkg.monoRepo?.kind ?? pkg.name;
		const releases = await context.getAllVersions(name);
		if (releases === undefined) {
			// Skip if there's no versions found in the repo
			return { skipReason: "Skipping package: no releases found" };
		}
		const versions = releases.map((v) => v.version);
		pinnedVersion = semver.maxSatisfying(versions, baseline);
		if (pinnedVersion === null) {
			return {
				skipReason: `Skipping package: couldn't calculate a pinned version for '${name}'`,
			};
		}
	}

	const prevVersion =
		exactPreviousVersionString === undefined
			? pinnedVersion ?? baseline
			: exactPreviousVersionString;

	// check that the version exists on npm before trying to add the
	// dev dep and bumping the typeValidation version
	// if the version does not exist, we will defer updating the package
	const packageDef = `${packageDetails.json.name}@${prevVersion}`;
	const args = ["view", `"${packageDef}"`, "version", "--json"];
	const result = child_process.execSync(`npm ${args.join(" ")}`, { cwd: packageDir }).toString();
	const maybeVersions = result?.length > 0 ? safeParse(result, args.join(" ")) : undefined;

	const versionsArray =
		typeof maybeVersions === "string"
			? [maybeVersions]
			: Array.isArray(maybeVersions)
			? maybeVersions
			: [];

	if (versionsArray.length === 0) {
		return { skipReason: `Skipping package: ${packageDef} not found on npm` };
	} else {
		packageDetails.json.devDependencies[
			`${packageDetails.json.name}-previous`
		] = `npm:${packageDef}`;

		packageDetails.json.devDependencies = createSortedObject(
			packageDetails.json.devDependencies,
		);
		const disabled = packageDetails.json.typeValidation?.disabled;

		packageDetails.json.typeValidation = {
			version,
			previousVersionStyle,
			baselineRange: baseline,
			baselineVersion: baseline === prevVersion ? undefined : prevVersion,
			broken: resetBroken === true ? {} : packageDetails.json.typeValidation?.broken ?? {},
		};

		if (disabled !== undefined) {
			packageDetails.json.typeValidation.disabled = disabled;
		}

		if ((writeUpdates ?? false) === true) {
			await util.promisify(fs.writeFile)(
				`${packageDir}/package.json`,
				JSON.stringify(packageDetails.json, undefined, 2).concat("\n"),
			);
		}
	}

	const oldVersions = Object.keys(packageDetails.json.devDependencies ?? {}).filter((k) =>
		k.startsWith(packageDetails.json.name),
	);
	return {
		...packageDetails,
		oldVersions,
	};
}

export async function findPackagesUnderPath(path: string) {
	const searchPaths = [path];
	const packages: string[] = [];
	while (searchPaths.length > 0) {
		const search = searchPaths.shift()!;
		if (await util.promisify(fs.exists)(`${search}/package.json`)) {
			packages.push(search);
		} else {
			searchPaths.push(
				...fs
					.readdirSync(search, { withFileTypes: true })
					.filter((t) => t.isDirectory())
					.map((d) => `${search}/${d.name}`),
			);
		}
	}
	return packages;
}
