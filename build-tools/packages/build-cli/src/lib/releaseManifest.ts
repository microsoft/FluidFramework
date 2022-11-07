import {
    ReleaseVersion,
    VersionBumpType,
    VersionScheme,
    detectVersionScheme,
    getVersionRange,
} from "@fluid-tools/version-tools";

import { ReleaseGroup } from "../releaseGroups";

export interface PackageVersionList {
    [packageName: string]: string;
}

export interface ReleaseReport {
    [packageName: string]: ReleaseDetails;
}

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

export interface ReleaseRanges {
    minor: string;
    patch: string;
    caret: string;
    tilde: string;
}

export const getRanges = (version: ReleaseVersion, scheme?: VersionScheme): ReleaseRanges => {
    // eslint-disable-next-line no-param-reassign
    scheme = scheme ?? detectVersionScheme(version);
    return scheme === "internal"
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
