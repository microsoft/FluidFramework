/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Context, writeFileAsync } from "@fluidframework/build-tools";
import {
    detectBumpType,
    isVersionBumpType,
    ReleaseVersion,
    VersionBumpType,
} from "@fluid-tools/version-tools";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { differenceInBusinessDays, formatDistanceToNow, formatISO9075 } from "date-fns";
import inquirer from "inquirer";
import sortJson from "sort-json";
import { table } from "table";
import { BaseCommand } from "../../base";
import { getAllVersions, sortVersions, VersionDetails } from "../../lib";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../../releaseGroups";

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

    The command will prompt you to select versions for a package or release group in the event that multiple versions have recently been released.`;

    static examples = [
        {
            description: "Generate a minimal release report and display it in the terminal.",
            command: "<%= config.bin %> <%= command.id %> ",
        },
        {
            description: "Generate a minimal release report and output it to stdout as JSON.",
            command: "<%= config.bin %> <%= command.id %> --json",
        },
        {
            description: "Output a release report to 'report.json'.",
            command: "<%= config.bin %> <%= command.id %> -o report.json",
        },
        {
            description: "Output a full release report to 'report.json'.",
            command: "<%= config.bin %> <%= command.id %> -f -o report.json",
        },
    ];

    static enableJsonFlag = true;
    static flags = {
        days: Flags.integer({
            char: "d",
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
        output: Flags.file({
            char: "o",
            description: "Output a JSON report file to this location.",
        }),
        full: Flags.boolean({
            char: "f",
            description:
                "Output a full report. A full report includes additional metadata for each package, including the time of the release, the type of release (patch, minor, major), and whether the release is new.",
            dependsOn: ["output"],
        }),
        ...BaseCommand.flags,
    };

    releaseGroup: ReleaseGroup | ReleasePackage | undefined;
    releaseVersion: ReleaseVersion | undefined;

    public async run(): Promise<ReleaseReport | PackageVersionList> {
        const context = await this.getContext();
        const flags = this.processedFlags;
        const versionData: PackageReleaseData = {};

        const mode = flags.highest ? "version" : flags.mostRecent ? "date" : "interactive";

        this.log(`Collecting version data for release groups...`);
        /* eslint-disable no-await-in-loop */
        // collect version data for each release group
        for (const rg of context.repo.releaseGroups.keys()) {
            const name = rg;
            const repoVersion = context.getVersion(rg);

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

        this.log(`Collecting version data for independent packages...`);
        // collect version data for each release package (independent packages)
        for (const pkg of context.independentPackages) {
            const name = pkg.name;
            const repoVersion = pkg.version;

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
        /* eslint-enable no-await-in-loop */

        const report: ReleaseReport = await this.generateReleaseReport(versionData);
        const packageList: PackageVersionList = await this.generatePackageList(versionData);
        const tableData = this.generateReleaseTable(versionData);

        const finalReport = flags.full ? report : packageList;

        tableData.sort((a, b) => {
            if (a[0] > b[0]) {
                return 1;
            }

            if (a[0] < b[0]) {
                return -1;
            }

            return 0;
        });

        const output = table(tableData, {
            // columns: [{ alignment: "left" }, { alignment: "left" }, { alignment: "center" }, { alignment: "left" }, { alignment: "left" }],
            singleLine: true,
        });

        this.log(`Release Report\n\n${output}`);

        if (flags.output !== undefined) {
            await writeFileAsync(flags.output, JSON.stringify(finalReport));
            // Sort the JSON in-place
            sortJson.overwrite(flags.output, { indentSize: 2 });
            this.info(`Wrote output file: ${flags.output}`);
        }

        // When the --json flag is passed, the command will return the raw data as JSON.
        return finalReport;
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

        const sortedByVersion = await sortVersions(versions, "version");
        const sortedByDate = await sortVersions(versions, "date");
        const versionCount = sortedByVersion.length;

        if (sortedByDate === undefined) {
            this.error(`sortedByDate is undefined.`);
        }

        let latestReleasedVersion: VersionDetails | undefined;

        switch (mode) {
            case "interactive": {
                let answer: inquirer.Answers | undefined;

                const recentReleases = sortedByDate.filter((v) => {
                    const diff =
                        v.date === undefined ? 0 : differenceInBusinessDays(Date.now(), v.date);
                    return diff <= numberBusinessDaysToConsiderRecent;
                });

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

            const isNewRelease = this.isRecentRelease(verDetails);

            // Expand the release group to its constituent packages.
            if (isReleaseGroup(pkgName)) {
                for (const pkg of context.packagesInReleaseGroup(pkgName)) {
                    report[pkg.name] = {
                        version: latestVer,
                        date: latestDate,
                        releaseType: bumpType,
                        isNewRelease,
                    };
                }
            } else {
                report[pkgName] = {
                    version: latestVer,
                    date: latestDate,
                    releaseType: bumpType,
                    isNewRelease,
                };
            }
        }

        return report;
    }

    private generateMinimalReport(reportData: PackageReleaseData): MinimalReleaseReport {
        const newObj: MinimalReleaseReport = {};
        for (const [pkg, data] of Object.entries(reportData)) {
            newObj[pkg] = data.latestReleasedVersion;
        }

        return newObj;
    }

    private async generatePackageList(reportData: PackageReleaseData): Promise<PackageVersionList> {
        const context = await this.getContext();
        const newObj: PackageVersionList = {};

        for (const [pkg, data] of Object.entries(reportData)) {
            if (isReleaseGroup(pkg)) {
                for (const p of context.packagesInReleaseGroup(pkg)) {
                    newObj[p.name] = data.latestReleasedVersion.version;
                }
            } else {
                newObj[pkg] = data.latestReleasedVersion.version;
            }
        }

        return newObj;
    }

    private generateReleaseTable(reportData: PackageReleaseData): string[][] {
        const tableData: string[][] = [];

        for (const [pkgName, verDetails] of Object.entries(reportData)) {
            const { date: latestDate, version: latestVer } = verDetails.latestReleasedVersion;

            const displayDate =
                latestDate === undefined
                    ? "--no date--"
                    : formatISO9075(latestDate, { representation: "date" });

            const highlight = this.isRecentRelease(verDetails) ? chalk.green : chalk.white;

            let displayRelDate: string;
            if (latestDate === undefined) {
                displayRelDate = "";
            } else {
                const relDate = `${formatDistanceToNow(latestDate)} ago`;
                displayRelDate = highlight(relDate);
            }

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

        return tableData;
    }

    private isRecentRelease(data: RawReleaseData): boolean {
        const latestDate = data.latestReleasedVersion.date;

        return latestDate === undefined
            ? false
            : differenceInBusinessDays(Date.now(), latestDate) < this.processedFlags.days;
    }
}

interface RawReleaseData {
    repoVersion: VersionDetails;
    latestReleasedVersion: VersionDetails;
    previousReleasedVersion?: VersionDetails;
    versions: readonly VersionDetails[];
}

interface ReleaseDetails {
    version: string;
    date?: Date;
    releaseType: VersionBumpType;
    isNewRelease: boolean;
    releaseGroup?: ReleaseGroup;
}

interface PackageReleaseData {
    [packageName: string]: RawReleaseData;
}

interface ReleaseReport {
    [packageName: string]: ReleaseDetails;
}

interface MinimalReleaseReport {
    [packageName: string]: VersionDetails;
}

interface PackageVersionList {
    [packageName: string]: string;
}

export type { PackageVersionList, ReleaseReport };
