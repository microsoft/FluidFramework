/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ReleaseVersion,
	VersionBumpType,
	VersionScheme,
	detectVersionScheme,
	getVersionRange,
} from "@fluid-tools/version-tools";
import * as semver from "semver";

import type { Package } from "@fluidframework/build-tools";
import type { LegacyCompatInterval } from "../config.js";
import { ReleaseGroup } from "../releaseGroups.js";

/**
 * A map of package names to full release reports. This is the format of the "full" release report.
 */
export interface ReleaseReport {
	[packageName: string]: ReleaseDetails;
}

/**
 * Full details about a release.
 */
export interface ReleaseDetails {
	version: ReleaseVersion;
	previousVersion?: ReleaseVersion;
	versionScheme: VersionScheme;
	date?: Date;
	releaseType: VersionBumpType;
	isNewRelease: boolean;
	releaseGroup?: ReleaseGroup;
	ranges: ReleaseRanges;
}

/**
 * Version range strings. These strings are included in release reports so that partners can use the strings as-is in
 * package.json dependencies.
 *
 * @remarks
 *
 * "minor" and "caret" are equivalent, as are "patch" and "tilde." All four are included because both terms are commonly
 * used by partners, and having both eases confusion.
 */
export interface ReleaseRanges {
	/**
	 * A minor version range. Equivalent to caret.
	 */
	minor: string;

	/**
	 * A patch version range. Equivalent to tilde.
	 */
	patch: string;

	/**
	 * A caret version range. Equivalent to minor.
	 */
	caret: string;

	/**
	 * A tilde version range. Equivalent to patch.
	 */
	tilde: string;

	/**
	 * A legacy compat range. It exists only for the "client" release group.
	 */
	legacyCompat: string;
}

/**
 * Get the release ranges for a version string.
 *
 * @param version - The version.
 * @param interval - The multiple of minor versions to use for calculating the next version in the range.
 * @param pkg - Package name or package details such as release group, etc
 * @param scheme - If provided, this version scheme will be used. Otherwise the scheme will be detected from the
 * version.
 * @returns The {@link ReleaseRanges} for a version string
 */
export const getRanges = (
	version: ReleaseVersion,
	interval: LegacyCompatInterval,
	pkg: Package | string,
	scheme?: VersionScheme,
): ReleaseRanges => {
	const schemeToUse = scheme ?? detectVersionScheme(version);

	return schemeToUse === "internal"
		? {
				patch: getVersionRange(version, "patch"),
				minor: getVersionRange(version, "minor"),
				tilde: getVersionRange(version, "~"),
				caret: getVersionRange(version, "^"),
				legacyCompat: getLegacyCompatVersionRange(version, schemeToUse, pkg, interval),
			}
		: {
				patch: `~${version}`,
				minor: `^${version}`,
				tilde: `~${version}`,
				caret: `^${version}`,
				legacyCompat: getLegacyCompatVersionRange(version, schemeToUse, pkg, interval),
			};
};

/**
 * An interface representing a mapping of package names to their corresponding version strings.
 */
interface PackageRange {
	[packageName: string]: string;
}

/**
 * A type representing the different kinds of report formats we output.
 *
 * "full" corresponds to the {@link ReleaseReport} interface. It contains a lot of package metadata indexed by package
 * name.
 *
 * The "caret", "tilde", and "legacy-compat" correspond to the {@link PackageRange} interface.
 * Each of these compatibility classes contains a map of package names to their respective
 * equivalent version range strings:
 * "caret": caret-equivalent version ranges.
 * "tilde": tilde-equivalent version ranges.
 * "legacy-compat": legacy compat equivalent version ranges.
 */
export type ReportKind = "full" | "caret" | "tilde" | "simple" | "legacy-compat";

/**
 * Converts a {@link ReleaseReport} into different formats based on the kind.
 */
export function toReportKind(
	report: ReleaseReport,
	kind: ReportKind,
): ReleaseReport | PackageRange {
	const toReturn: PackageRange = {};

	switch (kind) {
		case "full": {
			return report;
		}

		case "simple": {
			for (const [pkg, details] of Object.entries(report)) {
				toReturn[pkg] = details.version;
			}

			break;
		}

		case "caret": {
			for (const [pkg, details] of Object.entries(report)) {
				toReturn[pkg] = details.ranges.caret;
			}

			break;
		}

		case "tilde": {
			for (const [pkg, details] of Object.entries(report)) {
				toReturn[pkg] = details.ranges.tilde;
			}

			break;
		}

		case "legacy-compat": {
			for (const [pkg, details] of Object.entries(report)) {
				toReturn[pkg] = details.ranges.legacyCompat;
			}
			break;
		}

		default: {
			throw new Error(`Unexpected ReportKind: ${kind}`);
		}
	}

	return toReturn;
}

/**
 * Generates a new version representing the next version in a legacy compatibility range based on a specified multiple of minor versions.
 *
 * @param version - A string representing the current version.
 * @param schemeToUse - If provided, this version scheme will be used. Otherwise the scheme will be detected from the
 * version.
 * @param pkg - Package name or package details such as release group, etc
 * @param interval - The multiple of minor versions to use for calculating the next version in the range.
 *
 * @returns A string representing the next version in the legacy compatibility range.
 */
export function getLegacyCompatVersionRange(
	version: string,
	schemeToUse: VersionScheme,
	pkg: Package | string,
	interval: LegacyCompatInterval,
): string {
	if (
		interval.server !== 0 ||
		interval["build-tools"] !== 0 ||
		interval.historian !== 0 ||
		interval.gitrest !== 0
	) {
		throw new Error(`Legacy API contract only exists for the client release group`);
	}

	if (interval.client === 0) {
		throw new Error(`Legacy compat interval not found for client release group`);
	}

	if (typeof pkg !== "string" && pkg.monoRepo?.releaseGroup === "client") {
		const range = getLegacyRangeForClient(version, interval.client);
		return range;
	}

	return schemeToUse === "internal" ? getVersionRange(version, "^") : `^${version}`;
}

/**
 * Generates a new version representing the next version in a legacy compatibility range for "client" release group.
 *
 * @param version - A string representing the current version.
 * @param interval - The multiple of minor versions to use for calculating the next version in the range for "client" release group.
 *
 * @returns A string representing the next version in the legacy compatibility range for "client" release group.
 */
export function getLegacyRangeForClient(version: string, interval: number): string {
	const semVersion = semver.parse(version);
	if (!semVersion) {
		throw new Error("Invalid version string");
	}
	// Calculate the next compatible minor version using the compatVersionInterval
	const baseMinor = Math.floor(semVersion.minor / interval) * interval;
	const newSemVerString = `${semVersion.major}.${baseMinor + interval}.0`;

	const higherVersion = semver.parse(newSemVerString);
	if (higherVersion === null) {
		throw new Error(
			`Couldn't convert ${version} to the legacy version scheme. Tried parsing: '${newSemVerString}'`,
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	const rangeString = `>=${version} <${higherVersion}`;
	const range = semver.validRange(rangeString);
	if (range === null) {
		throw new Error(`The generated range string was invalid: "${rangeString}"`);
	}

	return range;
}
