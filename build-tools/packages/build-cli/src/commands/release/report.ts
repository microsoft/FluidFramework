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
    detectBumpType,
    detectVersionScheme,
    getVersionRange,
    isVersionBumpType,
} from "@fluid-tools/version-tools";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";
import {
    PackageVersionList,
    ReleaseRanges,
    ReleaseReport,
    ReportKind,
    VersionDetails,
    filterVersionsOlderThan,
    getAllVersions,
    getDisplayDate,
    getDisplayDateRelative,
    sortVersions,
    toReportKind,
} from "../../lib";
import { CommandLogger } from "../../logging";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../../releaseGroups";

const DEFAULT_MIN_VERSION = "0.0.0";

export abstract class ReleaseReportBaseCommand<
    T extends typeof ReleaseReportBaseCommand.flags,
> extends BaseCommand<T> {
    protected releaseData: PackageReleaseData | undefined;

    static flags = {
        highest: Flags.boolean({
            char: "s",
            description: "Always pick the greatest semver version as the latest (ignore dates).",
            exclusive: ["mostRecent", "interactive"],
        }),
        mostRecent: Flags.boolean({
            char: "r",
            description:
                "Always pick the most recent version as the latest (ignore semver version sorting).",
            exclusive: ["highest", "interactive"],
        }),
        releaseGroup: releaseGroupFlag({
            required: false,
        }),
        ...BaseCommand.flags,
    };

    public async init(): Promise<void> {
        await super.init();

        const context = await this.getContext();
        const flags = this.processedFlags;

        this.releaseData = await this.collectReleaseData(
            context,
            flags.releaseGroup,
            flags.highest ? "version" : "date",
        );
    }

    protected isRecentReleaseByDate(date?: Date, days?: number): boolean {
        return date === undefined
            ? false
            : days === undefined
            ? true
            : differenceInBusinessDays(Date.now(), date) < days;
    }

    protected async collectReleaseData(
        context: Context,
        releaseGroupOrPackage: ReleaseGroup | ReleasePackage | undefined,
        mode: "interactive" | "date" | "version" = "interactive",
    ): Promise<PackageReleaseData | undefined> {
        const versionData: PackageReleaseData = {};

        if (releaseGroupOrPackage === undefined || isReleaseGroup(releaseGroupOrPackage)) {
            this.log(`Collecting version data for release groups...`);
            for (const rg of context.repo.releaseGroups.keys()) {
                if (releaseGroupOrPackage !== undefined && releaseGroupOrPackage !== rg) {
                    this.verbose(`Skipping '${rg} because it's excluded.`);
                    continue;
                }

                const name = rg;
                const repoVersion = context.getVersion(rg);

                // eslint-disable-next-line no-await-in-loop
                const data = await this.collectRawReleaseData(
                    context,
                    name,
                    repoVersion,
                    undefined,
                    mode,
                );
                if (data !== undefined) {
                    versionData[name] = data;
                }
            }
        }

        if (isReleaseGroup(releaseGroupOrPackage)) {
            this.verbose(
                `Not collecting version data for independent packages because --releaseGroup was set.`,
            );
        } else {
            this.log(`Collecting version data for independent packages...`);
            for (const pkg of context.independentPackages) {
                if (releaseGroupOrPackage !== undefined && releaseGroupOrPackage !== pkg.name) {
                    this.verbose(`Skipping '${pkg.name} because it's excluded.`);
                    continue;
                }

                const name = pkg.name;
                const repoVersion = pkg.version;

                // eslint-disable-next-line no-await-in-loop
                const data = await this.collectRawReleaseData(
                    context,
                    name,
                    repoVersion,
                    undefined,
                    mode,
                );
                if (data !== undefined) {
                    versionData[name] = data;
                }
            }
        }

        return versionData;
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
    private async collectRawReleaseData(
        context: Context,
        releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
        repoVersion: string,
        numberBusinessDaysToConsiderRecent: number | undefined,
        mode: "interactive" | "date" | "version",
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

                const recentReleases =
                    numberBusinessDaysToConsiderRecent === undefined
                        ? sortedByDate
                        : filterVersionsOlderThan(sortedByDate, numberBusinessDaysToConsiderRecent);

                // No recent releases, so set the latest to the highest semver
                if (recentReleases.length === 0) {
                    if (sortedByVersion.length > 0) {
                        latestReleasedVersion = sortedByVersion[0];
                    } else {
                        this.errorLog(`No releases at all! ${releaseGroupOrPackage}`);
                    }
                }

                if (recentReleases.length === 1) {
                    latestReleasedVersion = recentReleases[0];
                } else if (recentReleases.length > 1) {
                    const question: inquirer.ListQuestion = {
                        type: "list",
                        name: "selectedPackageVersion",
                        message: `Multiple versions of ${releaseGroupOrPackage} have been released. Select the one you want to include in the release report.`,
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

            case undefined:
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
}

export default class ReleaseReportCommand<
    T extends typeof ReleaseReportCommand.flags,
> extends ReleaseReportBaseCommand<T> {
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
            description:
                "[default: infinity] The number of days to look back for releases to report.",
        }),
        interactive: Flags.boolean({
            description: "Prompts the user to select a release for each release group or package.",
            exclusive: ["highest", "mostRecent"],
        }),
        output: Flags.directory({
            char: "o",
            description: "Output JSON report files to this location.",
        }),
        ...ReleaseReportBaseCommand.flags,
    };

    // public async init(): Promise<void> {
    //     await super.init();

    //     const context = await this.getContext();

    //     this.releaseData = await this.collectReleaseData(
    //         context,
    //         this.processedFlags.releaseGroup,
    //         this.processedFlags.interactive
    //             ? "interactive"
    //             : this.processedFlags.highest
    //             ? "version"
    //             : "date",
    //     );
    // }

    public async run(): Promise<ReleaseReport | PackageVersionList | any> {
        const context = await this.getContext();
        const flags = this.processedFlags;

        // const mode = flags.highest ? "version" : flags.mostRecent ? "date" : "interactive";
        const shouldOutputFiles = flags.output !== undefined;
        const outputPath = flags.output ?? process.cwd();

        if (this.releaseData === undefined) {
            this.error(`No releases found for ${flags.releaseGroup}`);
        }

        const report: ReleaseReport = await this.generateReleaseReport(this.releaseData);
        const tableData = this.generateReleaseTable(this.releaseData);

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
                writeReport(context, report, "simple", outputPath, flags.releaseGroup, this.logger),
                writeReport(context, report, "full", outputPath, flags.releaseGroup, this.logger),
                writeReport(context, report, "caret", outputPath, flags.releaseGroup, this.logger),
                writeReport(context, report, "tilde", outputPath, flags.releaseGroup, this.logger),
            ];

            await Promise.all(promises);
        }

        // When the --json flag is passed, the command will return the raw data as JSON.
        return report;
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

            const isNewRelease = this.isRecentReleaseByDate(latestDate, this.processedFlags.days);
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
            const highlight = this.isRecentReleaseByDate(latestDate, this.processedFlags.days)
                ? chalk.green
                : chalk.white;
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
}

interface PackageReleaseData {
    [packageName: string]: RawReleaseData;
}

interface RawReleaseData {
    repoVersion: VersionDetails;
    latestReleasedVersion: VersionDetails;
    previousReleasedVersion?: VersionDetails;
    versions: readonly VersionDetails[];
}

/**
 * Generates a report filename.
 */
function generateReportFileName(
    kind: ReportKind,
    releaseVersion: ReleaseVersion,
    releaseGroup?: ReleaseGroup,
): string {
    if (releaseGroup === undefined && releaseVersion === undefined) {
        throw new Error(`Both releaseGroup and releaseVersion were undefined.`);
    }

    return `fluid-framework-release-manifest.${releaseGroup ?? "all"}.${
        releaseVersion ?? DEFAULT_MIN_VERSION
    }.${kind}.json`;
}

/**
 * Writes a report to a file.
 */
// eslint-disable-next-line max-params
async function writeReport(
    context: Context,
    report: ReleaseReport,
    kind: ReportKind,
    dir: string,
    releaseGroup?: ReleaseGroup,
    log?: CommandLogger,
): Promise<void> {
    const version =
        releaseGroup === undefined
            ? // Use container-runtime as a proxy for the client release group.
              report["@fluidframework/container-runtime"].version
            : context.getVersion(releaseGroup);

    const reportName = generateReportFileName(kind, version, releaseGroup);
    const reportPath = path.join(dir, reportName);
    log?.info(`${kind} report written to ${reportPath}`);
    const reportOutput = toReportKind(report, kind);

    return writeJson(reportPath, sortJson(reportOutput), { spaces: 2 });
}
