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

import { ReleaseGroup } from "../releaseGroups.js";

/**
 * A map of package names to their versions. This is the format of the "simple" release report.
 */
export interface PackageVersionList {
	[packageName: string]: ReleaseVersion;
}

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
}

/**
 * Get the release ranges for a version string.
 *
 * @param version - The version.
 * @param scheme - If provided, this version scheme will be used. Otherwise the scheme will be detected from the
 * version.
 * @returns The {@link ReleaseRanges} for a version string
 */
export const getRanges = (version: ReleaseVersion, scheme?: VersionScheme): ReleaseRanges => {
	const schemeToUse = scheme ?? detectVersionScheme(version);
	return schemeToUse === "internal"
		? {
				patch: getVersionRange(version, "patch"),
				minor: getVersionRange(version, "minor"),
				tilde: getVersionRange(version, "~"),
				caret: getVersionRange(version, "^"),
			}
		: {
				patch: `~${version}`,
				minor: `^${version}`,
				tilde: `~${version}`,
				caret: `^${version}`,
			};
};

interface PackageCaretRange {
	[packageName: string]: string;
}

interface PackageTildeRange {
	[packageName: string]: string;
}

/**
 * A type representing the different kinds of report formats we output.
 *
 * "full" corresponds to the {@link ReleaseReport} interface. It contains a lot of package metadata indexed by package
 * name.
 *
 * "simple" corresponds to the {@link PackageVersionList} interface. It contains a map of package names to versions.
 *
 * "caret" corresponds to the {@link PackageCaretRange} interface. It contains a map of package names to
 * caret-equivalent version range strings.
 *
 * "tilde" corresponds to the {@link PackageTildeRange} interface. It contains a map of package names to
 * tilde-equivalent version range strings.
 */
export type ReportKind = "full" | "caret" | "tilde" | "simple";

/**
 * Converts a {@link ReleaseReport} into different formats based on the kind.
 */
export function toReportKind(
	report: ReleaseReport,
	kind: ReportKind,
): ReleaseReport | PackageVersionList | PackageTildeRange | PackageCaretRange {
	const toReturn: PackageVersionList | PackageTildeRange | PackageCaretRange = {};

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

		default: {
			throw new Error(`Unexpected ReportKind: ${kind}`);
		}
	}

	return toReturn;
}
