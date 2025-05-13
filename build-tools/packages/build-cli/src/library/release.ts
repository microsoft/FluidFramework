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

import type { ReleaseReportConfig } from "../config.js";
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
 * "minor" and "caret" are equivalent, as are "patch" and "tilde." All five are included because both terms are commonly
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
	 * A legacy compatibility range that is configurable per release group.
	 * This range extends beyond standard version ranges and lies between major and minor versions.
	 * Exceeding this range indicates compatibility differences.
	 */
	legacyCompat: string;
}

/**
 * Get the release ranges for a version string.
 *
 * @param version - The version.
 * @param legacyCompatInterval - The multiple of minor versions to use for calculating the next version in the range.
 * @param releaseGroupOrPackage - Release group or package name
 * @param scheme - If provided, this version scheme will be used. Otherwise the scheme will be detected from the
 * version.
 * @returns The {@link ReleaseRanges} for a version string
 */
export const getRanges = (
	version: ReleaseVersion,
	legacyCompatInterval: ReleaseReportConfig,
	releaseGroupOrPackage: ReleaseGroup | string,
	scheme?: VersionScheme,
): ReleaseRanges => {
	const schemeToUse = scheme ?? detectVersionScheme(version);

	return schemeToUse === "internal"
		? {
				patch: getVersionRange(version, "patch"),
				minor: getVersionRange(version, "minor"),
				tilde: getVersionRange(version, "~"),
				caret: getVersionRange(version, "^"),
				// legacyCompat is not currently supported for internal schema. Fallback to major compatibility range.
				legacyCompat: getVersionRange(version, "^"),
			}
		: {
				patch: `~${version}`,
				minor: `^${version}`,
				tilde: `~${version}`,
				caret: `^${version}`,
				legacyCompat: getLegacyCompatVersionRange(
					version,
					legacyCompatInterval,
					releaseGroupOrPackage,
				),
			};
};

/**
 * An interface representing a mapping of package names to their corresponding version strings or ranges.
 */
interface PackageVersion {
	[packageName: string]: string;
}

/**
 * A type representing the different kinds of report formats we output.
 *
 * "full" corresponds to the {@link ReleaseReport} interface. It contains a lot of package metadata indexed by package
 * name.
 *
 * The "caret", "tilde", and "legacy-compat" correspond to the {@link PackageVersion} interface.
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
): ReleaseReport | PackageVersion {
	const toReturn: PackageVersion = {};

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
 * @param interval - The multiple of minor versions to use for calculating the next version in the range.
 * @param releaseGroupOrPackage - Release group or package name
 *
 * @returns A string representing the next version in the legacy compatibility range.
 */
function getLegacyCompatVersionRange(
	version: string,
	interval: ReleaseReportConfig,
	releaseGroupOrPackage: ReleaseGroup | string,
): string {
	const intervalValue = interval.legacyCompatInterval[releaseGroupOrPackage];
	if (intervalValue > 0) {
		return getLegacyCompatRange(version, intervalValue);
	}

	// If legacy compat range is equal to 0, return caret version.
	return `^${version}`;
}

/**
 * Generates a new version representing the next version in a legacy compatibility range for any release group.
 * Does not support Fluid internal schema or prerelease versions.
 *
 * @param version - A string representing the current version.
 * @param interval - The multiple of minor versions to use for calculating the next version.
 *
 * @returns A string representing the next version in the legacy compatibility range.
 */
export function getLegacyCompatRange(version: string, interval: number): string {
	const semVersion = semver.parse(version);
	if (!semVersion) {
		throw new Error("Invalid version string");
	}

	if (detectVersionScheme(version) === "internal") {
		throw new Error(`Internal version schema is not supported`);
	}

	if (semVersion.prerelease.length > 0) {
		throw new Error(`Prerelease section is not expected`);
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
