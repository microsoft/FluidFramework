/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { strict as assert } from "assert";
import chalk from "chalk";
import { differenceInBusinessDays, formatDistanceToNow, formatISO9075 } from "date-fns";
import { writeJson } from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import sortJson from "sort-json";
import { table } from "table";

import { Context } from "@fluidframework/build-tools";

import {
    ReleaseVersion,
    VersionBumpType,
    VersionScheme,
    detectBumpType,
    detectVersionScheme,
    getVersionRange,
    isVersionBumpType,
} from "@fluid-tools/version-tools";

import { BaseCommand } from "../../base";
import { packageSelectorFlag, releaseGroupFlag } from "../../flags";
import { VersionDetails, filterVersionsOlderThan, getAllVersions, sortVersions } from "../../lib";
import { CommandLogger } from "../../logging";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../../releaseGroups";

const MAX_BUSINESS_DAYS_TO_CONSIDER_RECENT = 10;
const DEFAULT_MIN_VERSION = "0.0.0";

/**
 * Releases a release group recursively.
 *
 * @remarks
 *
 * First the release group's dependencies are checked. If any of the dependencies are also in the repo, then they're
 * checked for the latest release version. If the dependencies have not yet been released, then the command prompts to
 * perform the release of the dependency, then run the releae command again.
 *
 * This process is continued until all the dependencies have been released, after which the release group itself is
 * released.
 */
export default class ReleaseReportCommand extends BaseCommand<typeof ReleaseReportCommand.flags> {
    static summary = "Generates a report of Fluid Framework releases.";
    static description = `The release report command is used to produce a report of all the packages that were released and their current version. After a release, it is useful to generate this report to provide to customers, so they can update their dependencies to the most recent version.

    The command will prompt you to select versions for a package or release group in the event that multiple versions have recently been released.

    Using the --all flag, you can list all the releases for a given release group or package.`;

    static examples = [
        {
            description: "Output all release report files to the current directory.",
            command: "<%= config.bin %> <%= command.id %> -o .",
        },
        {
            description: "Generate a minimal release report and display it in the terminal.",
            command: "<%= config.bin %> <%= command.id %> ",
        },
        {
            description: "Generate a minimal release report and output it to stdout as JSON.",
            command: "<%= config.bin %> <%= command.id %> --json",
        },
        {
            description: "List all the releases of the azure release group.",
            command: "<%= config.bin %> <%= command.id %> --all -g azure",
        },
        {
            description: "List the 10 most recent client releases.",
            command: "<%= config.bin %> <%= command.id %> --all -g client --limit 10",
        },
    ];

    static enableJsonFlag = true;
    static flags = {
        days: Flags.integer({
            description: "The number of days to look back for releases to report.",
            default: MAX_BUSINESS_DAYS_TO_CONSIDER_RECENT,
        }),
        highest: Flags.boolean({
            char: "s",
            description: "Always pick the greatest semver version as the latest (ignore dates).",
            exclusive: ["mostRecent"],
        }),
        mostRecent: Flags.boolean({
            char: "r",
            description:
                "Always pick the most recent version as the latest (ignore semver version sorting).",
            exclusive: ["highest"],
        }),
        output: Flags.directory({
            char: "o",
            description: "Output JSON report files to this location.",
        }),
        all: Flags.boolean({
            description:
                "List all releases. Useful when you want to see all the releases done for a release group or package. The number of results can be limited using the --limit argument.",
            exclusive: ["output"],
        }),
        releaseGroup: releaseGroupFlag({
            dependsOn: ["all"],
            exclusive: ["package"],
        }),
        package: packageSelectorFlag({
            dependsOn: ["all"],
            exclusive: ["releaseGroup"],
        }),
        limit: Flags.integer({
            dependsOn: ["all"],
            description: `Limits the number of displayed releases for each release group.`,
        }),
        ...BaseCommand.flags,
    };

    releaseGroup: ReleaseGroup | ReleasePackage | undefined;
    releaseVersion: ReleaseVersion | undefined;

    public async run(): Promise<ReleaseReport | PackageVersionList> {
        const context = await this.getContext();
        const flags = this.processedFlags;
        const versionData: PackageReleaseData = {};

        const mode =
            flags.all || flags.highest ? "version" : flags.mostRecent ? "date" : "interactive";
        const filter = flags.releaseGroup ?? flags.package;
        const shouldOutputFiles = flags.output !== undefined;
        const outputPath = flags.output ?? process.cwd();

        if (filter === undefined || isReleaseGroup(filter)) {
            this.log(`Collecting version data for release groups...`);
            for (const rg of context.repo.releaseGroups.keys()) {
                if (filter !== undefined && filter !== rg) {
                    this.verbose(`Skipping '${rg} because it's excluded.`);
                    continue;
                }

                const name = rg;
                const repoVersion = context.getVersion(rg);

                // eslint-disable-next-line no-await-in-loop
                const data = await this.collectReleaseData(
                    context,
                    name,
                    repoVersion,
                    flags.days,
                    mode,
                );
                if (data !== undefined) {
                    versionData[name] = data;
                }
            }
        }

        if (isReleaseGroup(filter)) {
            this.verbose(
                `Not collecting version data for independent packages because --releaseGroup was set.`,
            );
        } else {
            this.log(`Collecting version data for independent packages...`);
            for (const pkg of context.independentPackages) {
                if (filter !== undefined && filter !== pkg.name) {
                    this.verbose(`Skipping '${pkg.name} because it's excluded.`);
                    continue;
                }

                const name = pkg.name;
                const repoVersion = pkg.version;

                // eslint-disable-next-line no-await-in-loop
                const data = await this.collectReleaseData(
                    context,
                    name,
                    repoVersion,
                    flags.days,
                    mode,
                );
                if (data !== undefined) {
                    versionData[name] = data;
                }
            }
        }

        if (flags.all === true) {
            for (const [pkgOrReleaseGroup, data] of Object.entries(versionData)) {
                const versions = sortVersions([...data.versions], "version");
                const releaseTable = this.generateAllReleasesTable(pkgOrReleaseGroup, versions);

                this.log(
                    table(releaseTable, {
                        singleLine: true,
                    }),
                );
            }

            this.exit();
        }

        const report: ReleaseReport = await this.generateReleaseReport(versionData);
        const tableData = this.generateReleaseTable(versionData);

        const output = table(tableData, {
            singleLine: true,
        });

        this.logHr();
        this.log(chalk.underline(chalk.bold(`Release Report`)));
        this.log(`\n${output}`);
        this.logHr();

        if (shouldOutputFiles) {
            this.info(`Writing files to path: ${path.resolve(outputPath)}`);
            const promises = [
                writeReport(report, "simple", outputPath, this.logger),
                writeReport(report, "full", outputPath, this.logger),
                writeReport(report, "caret", outputPath, this.logger),
                writeReport(report, "tilde", outputPath, this.logger),
            ];

            await Promise.all(promises);
        }

        // When the --json flag is passed, the command will return the raw data as JSON.
        return report;
    }

    /**
     * Collects the releases of a given release group or package.
     *
     * @param context - The {@link Context}.
     * @param releaseGroupOrPackage - The release group or package to collect release data for.
     * @param repoVersion - The version of the release group or package in the repo.
     * @param numberBusinessDaysToConsiderRecent - If a release is within this number of business days, it will be
     * considered recent.
     * @param mode - Controls which release is considered the latest. The default, `"interactive"`, prompts the user to
     * select the version.
     * @returns The collected release data.
     */
    private async collectReleaseData(
        context: Context,
        releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
        repoVersion: string,
        numberBusinessDaysToConsiderRecent: number,
        mode: "interactive" | "date" | "version" = "interactive",
    ): Promise<RawReleaseData | undefined> {
        // const tags = await getTagsForReleaseGroup(context, releaseGroup);
        const versions = await getAllVersions(context, releaseGroupOrPackage);

        if (versions === undefined) {
            return undefined;
        }

        const sortedByVersion = sortVersions(versions, "version");
        const sortedByDate = sortVersions(versions, "date");
        const versionCount = sortedByVersion.length;

        if (sortedByDate === undefined) {
            this.error(`sortedByDate is undefined.`);
        }

        let latestReleasedVersion: VersionDetails | undefined;

        switch (mode) {
            case "interactive": {
                let answer: inquirer.Answers | undefined;

                const recentReleases = filterVersionsOlderThan(
                    sortedByDate,
                    numberBusinessDaysToConsiderRecent,
                );

                // No recent releases, so set the latest to the highest semver
                if (recentReleases.length === 0) {
                    if (sortedByVersion.length > 0) {
                        latestReleasedVersion = sortedByVersion[0];
                    } else {
                        console.log(
                            `error: no recent releases, and no releases at all! ${releaseGroupOrPackage}`,
                        );
                    }
                }

                if (recentReleases.length === 1) {
                    latestReleasedVersion = recentReleases[0];
                } else if (recentReleases.length > 1) {
                    const question: inquirer.ListQuestion = {
                        type: "list",
                        name: "selectedPackageVersion",
                        message: `Multiple versions of ${releaseGroupOrPackage} were released in the last ${numberBusinessDaysToConsiderRecent} business days. Select the one you want to include in the release report.`,
                        choices: recentReleases.map((v) => {
                            return {
                                name: `${v.version} (${formatDistanceToNow(v.date ?? 0)} ago)`,
                                value: v.version,
                                short: v.version,
                            };
                        }),
                    };

                    answer = await inquirer.prompt(question);
                    const selectedVersion =
                        answer === undefined
                            ? recentReleases[0].version
                            : (answer.selectedPackageVersion as string);
                    latestReleasedVersion = recentReleases.find(
                        (v) => v.version === selectedVersion,
                    );
                }

                break;
            }

            case "date": {
                latestReleasedVersion = sortedByDate[0];
                break;
            }

            case "version": {
                latestReleasedVersion = sortedByVersion[0];
                break;
            }

            default: {
                throw new Error(`Unhandled mode: ${mode}`);
            }
        }

        assert(latestReleasedVersion !== undefined, "latestReleasedVersion is undefined");

        const vIndex = sortedByVersion.findIndex(
            (v) =>
                v.version === latestReleasedVersion?.version &&
                v.date === latestReleasedVersion.date,
        );
        const previousReleasedVersion =
            vIndex + 1 <= versionCount
                ? sortedByVersion[vIndex + 1]
                : { version: DEFAULT_MIN_VERSION };

        return {
            repoVersion: {
                version: repoVersion,
            },
            latestReleasedVersion,
            previousReleasedVersion,
            versions,
        };
    }

    private async generateReleaseReport(reportData: PackageReleaseData): Promise<ReleaseReport> {
        const context = await this.getContext();
        const report: ReleaseReport = {};

        for (const [pkgName, verDetails] of Object.entries(reportData)) {
            if (verDetails.previousReleasedVersion === undefined) {
                this.warning(`No previous version for ${pkgName}.`);
            }

            const { version: latestVer, date: latestDate } = verDetails.latestReleasedVersion;
            const { version: prevVer } = verDetails.previousReleasedVersion ?? {
                version: DEFAULT_MIN_VERSION,
            };

            const bumpType = detectBumpType(prevVer, latestVer);
            if (!isVersionBumpType(bumpType)) {
                this.error(
                    `Invalid bump type (${bumpType}) detected in package ${pkgName}. ${prevVer} => ${latestVer}`,
                );
            }

            const isNewRelease = this.isRecentReleaseByDate(latestDate);
            const scheme = detectVersionScheme(latestVer);
            const ranges: ReleaseRanges | undefined =
                scheme === "internal"
                    ? {
                          patch: getVersionRange(latestVer, "patch"),
                          minor: getVersionRange(latestVer, "minor"),
                          tilde: getVersionRange(latestVer, "~"),
                          caret: getVersionRange(latestVer, "^"),
                      }
                    : {
                          patch: `~${latestVer}`,
                          minor: `^${latestVer}`,
                          tilde: `~${latestVer}`,
                          caret: `^${latestVer}`,
                      };

            // Expand the release group to its constituent packages.
            if (isReleaseGroup(pkgName)) {
                for (const pkg of context.packagesInReleaseGroup(pkgName)) {
                    report[pkg.name] = {
                        version: latestVer,
                        versionScheme: scheme,
                        date: latestDate,
                        releaseType: bumpType,
                        isNewRelease,
                        ranges,
                    };
                }
            } else {
                report[pkgName] = {
                    version: latestVer,
                    versionScheme: scheme,
                    date: latestDate,
                    releaseType: bumpType,
                    isNewRelease,
                    ranges,
                };
            }
        }

        return report;
    }

    private generateReleaseTable(reportData: PackageReleaseData): string[][] {
        const tableData: string[][] = [];

        for (const [pkgName, verDetails] of Object.entries(reportData)) {
            const { date: latestDate, version: latestVer } = verDetails.latestReleasedVersion;

            const displayDate = getDisplayDate(latestDate);
            const highlight = this.isRecentReleaseByDate(latestDate) ? chalk.green : chalk.white;
            const displayRelDate = highlight(getDisplayDateRelative(latestDate));

            const displayPreviousVersion =
                verDetails.previousReleasedVersion?.version === undefined
                    ? DEFAULT_MIN_VERSION
                    : verDetails.previousReleasedVersion.version;

            const bumpType = detectBumpType(
                verDetails.previousReleasedVersion?.version ?? DEFAULT_MIN_VERSION,
                latestVer,
            );
            const displayBumpType = highlight(`${bumpType}`);

            const displayVersionSection = chalk.grey(
                `${highlight(latestVer)} <= ${displayPreviousVersion}`,
            );

            tableData.push([
                pkgName,
                displayBumpType,
                displayRelDate,
                displayDate,
                displayVersionSection,
            ]);
        }

        tableData.sort((a, b) => {
            if (a[0] > b[0]) {
                return 1;
            }

            if (a[0] < b[0]) {
                return -1;
            }

            return 0;
        });

        return tableData;
    }

    private isRecentReleaseByDate(date?: Date): boolean {
        return date === undefined
            ? false
            : differenceInBusinessDays(Date.now(), date) < this.processedFlags.days;
    }

    /**
     * Generates table data for all versions of a package/release group.
     */
    private generateAllReleasesTable(
        pkgOrReleaseGroup: ReleasePackage | ReleaseGroup,
        versions: VersionDetails[],
    ): string[][] {
        const tableData: string[][] = [];
        const releases = sortVersions(versions, "version").reverse();

        let index = 0;
        for (const ver of releases) {
            const displayPreviousVersion =
                index >= 1 ? releases[index - 1].version : DEFAULT_MIN_VERSION;

            const displayDate = getDisplayDate(ver.date);
            const highlight = this.isRecentReleaseByDate(ver.date) ? chalk.green : chalk.white;
            const displayRelDate = highlight(getDisplayDateRelative(ver.date));

            const bumpType = detectBumpType(displayPreviousVersion, ver.version);
            const displayBumpType = highlight(`${bumpType}`);

            const displayVersionSection = chalk.grey(
                `${highlight(ver.version)} <= ${displayPreviousVersion}`,
            );

            tableData.push([
                pkgOrReleaseGroup,
                displayBumpType,
                displayRelDate,
                displayDate,
                displayVersionSection,
            ]);

            index++;
        }

        const limit = this.processedFlags.limit;
        if (limit !== undefined && tableData.length > limit) {
            this.info(
                `Reached the release limit (${limit}), ignoring the remaining ${
                    tableData.length - limit
                } releases.`,
            );
            // The most recent releases are last, so slice from the end.
            return tableData.slice(-limit);
        }

        return tableData;
    }
}

/**
 * Formats a date for display in the terminal.
 */
function getDisplayDate(date?: Date): string {
    return date === undefined ? "--no date--" : formatISO9075(date, { representation: "date" });
}

/**
 * Formats a date relative to the current time for display in the terminal.
 */
function getDisplayDateRelative(date?: Date): string {
    return date === undefined ? "" : `${formatDistanceToNow(date)} ago`;
}

interface RawReleaseData {
    repoVersion: VersionDetails;
    latestReleasedVersion: VersionDetails;
    previousReleasedVersion?: VersionDetails;
    versions: readonly VersionDetails[];
}

interface ReleaseDetails {
    version: string;
    versionScheme: VersionScheme;
    date?: Date;
    releaseType: VersionBumpType;
    isNewRelease: boolean;
    releaseGroup?: ReleaseGroup;
    ranges: ReleaseRanges;
}

interface ReleaseRanges {
    minor: string;
    patch: string;
    caret: string;
    tilde: string;
}

interface PackageCaretRange {
    [packageName: string]: string;
}

interface PackageTildeRange {
    [packageName: string]: string;
}

interface PackageReleaseData {
    [packageName: string]: RawReleaseData;
}

interface PackageVersionList {
    [packageName: string]: string;
}

interface ReleaseReport {
    [packageName: string]: ReleaseDetails;
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
type ReportKind = "full" | "caret" | "tilde" | "simple";

/**
 * Generates a report filename.
 */
function generateReportFileName(report: ReleaseReport, kind: ReportKind): string {
    // Use container-runtime as a proxy for the client release group.
    const version = report["@fluidframework/container-runtime"].version;
    return ["fluid-framework-release", version, kind, "json"].join(".");
}

/**
 * Writes a report to a file.
 */
async function writeReport(
    report: ReleaseReport,
    kind: ReportKind,
    dir: string,
    log?: CommandLogger,
): Promise<void> {
    const reportName = generateReportFileName(report, kind);
    const reportPath = path.join(dir, reportName);
    log?.info(`${kind} report written to ${reportPath}`);
    const reportOutput = toReportKind(report, kind);

    return writeJson(reportPath, sortJson(reportOutput), { spaces: 2 });
}

/**
 * Converts a {@link ReleaseReport} into different formats based on the kind.
 */
function toReportKind(
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

export type { PackageVersionList, ReleaseReport };
