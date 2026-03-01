/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "node:child_process";

import * as semver from "semver";

import {
	changePreReleaseIdentifier,
	fromInternalScheme,
	isInternalVersionScheme,
} from "./internalVersionScheme";
import { detectVersionScheme, getLatestReleaseFromList } from "./schemes";

// TODO: Replace this with a shared release group type.
type TagPrefix = string | "client" | "server" | "azure" | "build-tools";

/**
 * Generates a simpler version scheme used for some packages and prereleases.
 */
export function getSimpleVersion(
	fileVersion: string,
	argBuildNum: string,
	argRelease: boolean,
	simplePatchVersioning: boolean,
): string {
	// Azure DevOp passes in the build number as $(buildNum).$(buildAttempt).
	// Get the Build number and ignore the attempt number.
	const buildId = simplePatchVersioning
		? Number.parseInt(argBuildNum.split(".")[0], 10)
		: undefined;
	let version = fileVersion;
	if (isInternalVersionScheme(version, /* allowPrereleases */ true)) {
		if (simplePatchVersioning) {
			throw new Error(
				`Cannot use simple patch versioning with Fluid internal versions. Version: ${fileVersion}`,
			);
		}

		if (!argRelease) {
			const prereleaseId = fromInternalScheme(version)[2];
			version = changePreReleaseIdentifier(
				version,
				// The "internal" prerelease identifier was historically transformed to "dev", so that behavior is preserved
				// here
				prereleaseId === "internal" ? "dev" : `dev-${prereleaseId}`,
			);
		}
	}

	const { releaseVersion, prereleaseVersion } = parseFileVersion(version, buildId);
	const build_suffix = buildId ? "" : argRelease ? "" : argBuildNum;
	const fullVersion = generateSimpleVersion(releaseVersion, prereleaseVersion, build_suffix);
	return fullVersion;
}

/**
 * Determines if the specified `current_version` is the latest version (higher than the tagged releases _and NOT_ a
 * pre-release version).
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param current_version - The version to test; that is, the version to check for being the latest build.
 * @param input_tags - If provided, only these tags will be considered. Mostly useful for testing.
 * @param includeInternalVersions - Whether to include Fluid internal builds, which are always
 * @param log - if true, logs to console.
 * @returns true if the current version is to be considered the latest.
 */
export function getIsLatest(
	prefix: TagPrefix,
	current_version: string,
	input_tags?: string[],
	includeInternalVersions = false,
	log = false,
): boolean {
	let latestTaggedRelease: string;

	if (input_tags?.length === 0) {
		latestTaggedRelease = "0.0.0";
	}

	let versions =
		input_tags === undefined
			? getVersions(prefix)
			: getVersionsFromStrings(prefix, input_tags);
	versions = versions.filter((v) => {
		if (v === undefined) {
			return false;
		}

		if (includeInternalVersions) {
			return true;
		}

		return !isInternalVersionScheme(v);
	});

	latestTaggedRelease = getLatestReleaseFromList(versions);
	if (versions.length === 0 || latestTaggedRelease === undefined) {
		latestTaggedRelease = "0.0.0";
	}

	if (log) {
		console.log(`Latest tagged: ${latestTaggedRelease}, current: ${current_version}`);
	}
	const currentIsGreater = semver.gte(current_version, latestTaggedRelease);
	const currentIsPrerelease = includeInternalVersions
		? detectVersionScheme(current_version) === "internalPrerelease"
		: semver.prerelease(current_version) !== null;

	return currentIsGreater && !currentIsPrerelease;
}

/* A simpler CI version that append the build number at the end in the prerelease */
function generateSimpleVersion(
	release_version: string,
	prerelease_version: string,
	build_suffix: string,
): string {
	// Generate the full version string
	if (prerelease_version) {
		if (build_suffix) {
			return `${release_version}-${prerelease_version}.${build_suffix}`;
		}
		return `${release_version}-${prerelease_version}`;
	}

	if (build_suffix) {
		return `${release_version}-${build_suffix}`;
	}

	return release_version;
}

function parseFileVersion(
	fileVersion: string,
	buildId?: number,
): {
	releaseVersion: string;
	prereleaseVersion: string;
} {
	const split = fileVersion.split("-");
	let releaseVersion = split[0];
	split.shift();
	const prereleaseVersion = split.join("-");

	/**
	 * Use the build id for patch number if given
	 */
	if (buildId) {
		// split the prerelease out
		const r = releaseVersion.split(".");
		if (r.length !== 3) {
			console.error(`ERROR: Invalid format for release version ${releaseVersion}`);
			// eslint-disable-next-line unicorn/no-process-exit
			process.exit(9);
		}
		r[2] = (Number.parseInt(r[2], 10) + buildId).toString();
		releaseVersion = r.join(".");
	}

	return { releaseVersion, prereleaseVersion };
}

/**
 * Extracts versions from the output of `git tag -l` in the working directory. The returned array will be sorted
 * ascending by semver version rules.
 *
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @returns An array of versions extracted from the output of `git tag -l`.
 */
function getVersions(prefix: TagPrefix): string[] {
	const raw_tags = child_process.execSync(`git tag -l`, { encoding: "utf8" });
	const tags = raw_tags.split(/\s+/g).map((t) => t.trim());
	return getVersionsFromStrings(prefix, tags);
}

/**
 * Extracts versions from an array of strings, sorts them according to semver rules, and returns the sorted array.
 *
 * @param prefix - The tag prefix to filter the tags by (client, server, etc.).
 * @param tags - An array of tags as strings.
 * @returns An array of versions extracted from the provided tags.
 */
export function getVersionsFromStrings(prefix: TagPrefix, tags: string[]): string[] {
	const versions = tags
		.filter((v) => v.startsWith(`${prefix}_v`))
		.map((tag) => tag.slice(`${prefix}_v`.length));
	semver.sort(versions);
	return versions;
}
