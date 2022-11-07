/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { CliUx, Flags } from "@oclif/core";
import { strict as assert } from "assert";
import chalk from "chalk";
import { differenceInBusinessDays, formatDistanceToNow } from "date-fns";
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
    getPreviousVersions,
    isVersionBumpType,
} from "@fluid-tools/version-tools";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";
import {
    PackageVersionList,
    PackageVersionMap,
    ReleaseReport,
    ReportKind,
    VersionDetails,
    filterVersionsOlderThan,
    getAllVersions,
    getDisplayDate,
    getDisplayDateRelative,
    getFluidDependencies,
    getRanges,
    sortVersions,
    toReportKind,
} from "../../lib";
import { CommandLogger } from "../../logging";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../../releaseGroups";

export type ReleaseSelectionMode = "interactive" | "date" | "version" | "inRepo";

const DEFAULT_MIN_VERSION = "0.0.0";

export abstract class ReleaseReportBaseCommand<
    T extends typeof ReleaseReportBaseCommand.flags,
> extends BaseCommand<T> {
    protected releaseData: PackageReleaseData | undefined;

    /**
     * The default {@link ReleaseSelectionMode} that the command uses.
     */
    protected abstract readonly defaultMode: ReleaseSelectionMode;

    /**
     * The number of business days for which to consider releases recent. `undefined` means there is no limit.
     */
    protected numberBusinessDaysToConsiderRecent: number | undefined;

    /**
     * The release group or package that is being reported on.
     */
    protected abstract releaseGroupOrPackage: ReleaseGroup | ReleasePackage | undefined;

    /**
     * Returns true if the `date` is within `days` days of the current date.
     */
    protected isRecentReleaseByDate(date?: Date, days?: number): boolean {
        return date === undefined
            ? false
            : days === undefined
            ? true
            : differenceInBusinessDays(Date.now(), date) < days;
    }

    /**
     * Collect release data from the repo. Subclasses should call this in their init or run methods.
     *
     * @param context - The {@link Context}.
     * @param releaseGroup - If provided, the release data collected will be limited to only the pakages in this release
     * group and its direct Fluid dependencies.
     * @param mode - The {@link ReleaseSelectionMode} to use to determine the release to report on.
     */
    protected async collectReleaseData(
        context: Context,
        // eslint-disable-next-line default-param-last
        mode: ReleaseSelectionMode = this.defaultMode,
        releaseGroupOrPackage?: ReleaseGroup | ReleasePackage,
        includeDependencies = true,
    ): Promise<PackageReleaseData> {
        const versionData: PackageReleaseData = {};

        if (mode === "inRepo" && !isReleaseGroup(releaseGroupOrPackage)) {
            this.error(
                `Release group must be provided unless --interactive, --highest, or --mostRecent are provided.`,
            );
        }

        const rgs: ReleaseGroup[] = [];
        const pkgs: ReleasePackage[] = [];

        let rgVerMap: PackageVersionMap | undefined;
        let pkgVerMap: PackageVersionMap | undefined;

        if (mode === "inRepo") {
            if (isReleaseGroup(releaseGroupOrPackage)) {
                if (includeDependencies) {
                    [rgVerMap, pkgVerMap] = getFluidDependencies(context, releaseGroupOrPackage);
                    rgs.push(...(Object.keys(rgVerMap) as ReleaseGroup[]));
                    pkgs.push(...Object.keys(pkgVerMap));
                } else {
                    rgs.push(releaseGroupOrPackage);
                }
            }
        } else if (isReleaseGroup(releaseGroupOrPackage)) {
            rgs.push(releaseGroupOrPackage);
        } else if (releaseGroupOrPackage === undefined) {
            rgs.push(...context.repo.releaseGroups.keys());
            pkgs.push(...context.independentPackages.map((p) => p.name));
        } else {
            pkgs.push(releaseGroupOrPackage);
        }

        // Only show the spinner in non-interactive mode.
        if (mode !== "interactive") {
            CliUx.ux.action.start("Collecting version data");
        }

        for (const rg of rgs) {
            CliUx.ux.action.status = `${rg} (release group)`;
            // eslint-disable-next-line no-await-in-loop
            const data = await this.collectRawReleaseData(
                context,
                rg,
                rgVerMap?.[rg] ?? context.getVersion(rg),
                undefined,
                mode,
            );
            if (data !== undefined) {
                versionData[rg] = data;
            }
        }

        for (const pkg of pkgs) {
            const repoVersion = pkgVerMap?.[pkg] ?? context.fullPackageMap.get(pkg)?.version;
            assert(repoVersion !== undefined, `version of ${pkg} is undefined.`);

            CliUx.ux.action.status = `${pkg} (package)`;
            // eslint-disable-next-line no-await-in-loop
            const data = await this.collectRawReleaseData(
                context,
                pkg,
                repoVersion,
                undefined,
                mode,
            );
            if (data !== undefined) {
                versionData[pkg] = data;
            }
        }

        CliUx.ux.action.stop("Done!");
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
     * @param latestReleaseChooseMode - Controls which release is considered the latest. The default, `"date"`,
     * selects the most recently released version by date.
     * @returns The collected release data.
     */
    private async collectRawReleaseData(
        context: Context,
        releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
        repoVersion: string,
        numberBusinessDaysToConsiderRecent: number | undefined,
        latestReleaseChooseMode?: ReleaseSelectionMode,
    ): Promise<RawReleaseData | undefined> {
        this.verbose(`collectRawReleaseData for ${releaseGroupOrPackage}`);
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

        switch (latestReleaseChooseMode) {
            case undefined:
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

            case "inRepo": {
                latestReleasedVersion = sortedByVersion.find((v) => v.version === repoVersion);
                if (latestReleasedVersion === undefined) {
                    const [, previousMinor] = getPreviousVersions(repoVersion);
                    this.info(
                        `The in-repo version of ${chalk.blue(
                            releaseGroupOrPackage,
                        )} is ${chalk.yellow(
                            repoVersion,
                        )}, but there's no release for that version. Picked previous minor version instead: ${chalk.green(
                            previousMinor ?? "undefined",
                        )}. If you want to create a report for a specific version, check out the tag for the release and re-run this command.`,
                    );
                    latestReleasedVersion = sortedByVersion[0];
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
                throw new Error(`Unhandled mode: ${latestReleaseChooseMode}`);
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
    static description = `The release report command is used to produce a report of all the packages that were released and their version. After a release, it is useful to generate this report to provide to customers, so they can update their dependencies to the most recent version.

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
            char: "i",
            description:
                "Choose the version of each release group and package to contain in the release report.",
            exclusive: ["mostRecent", "highest"],
        }),
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
        output: Flags.directory({
            char: "o",
            description: "Output JSON report files to this location.",
        }),
        ...ReleaseReportBaseCommand.flags,
    };

    defaultMode: ReleaseSelectionMode = "inRepo";
    releaseGroupOrPackage: ReleaseGroup | ReleasePackage | undefined;

    public async run(): Promise<ReleaseReport | PackageVersionList | any> {
        const flags = this.processedFlags;

        const shouldOutputFiles = flags.output !== undefined;
        const outputPath = flags.output ?? process.cwd();

        const mode =
            flags.highest === true
                ? "version"
                : flags.mostRecent === true
                ? "date"
                : flags.interactive
                ? "interactive"
                : this.defaultMode;
        assert(mode !== undefined, `mode is undefined`);

        this.releaseGroupOrPackage = flags.releaseGroup;
        this.numberBusinessDaysToConsiderRecent = flags.days;
        const context = await this.getContext();

        // Collect the release version data from the history
        this.releaseData = await this.collectReleaseData(
            context,
            mode,
            this.releaseGroupOrPackage,
            /* includeDeps */ mode === "inRepo",
        );

        if (this.releaseData === undefined) {
            this.error(`No releases found for ${flags.releaseGroup}`);
        }
        const report = await this.generateReleaseReport(this.releaseData);

        const tableData = this.generateReleaseTable(report, flags.releaseGroup);

        const output = table(tableData, {
            singleLine: true,
        });

        this.logHr();
        this.log();
        this.log(chalk.underline(chalk.bold(`Release Report`)));
        if (mode === "inRepo" && flags.releaseGroup !== undefined) {
            this.log(
                `${chalk.black.bgYellow(
                    "\nIMPORTANT",
                )}: This report only includes the direct dependencies of the ${chalk.blue(
                    flags.releaseGroup,
                )} release group.${context.getVersion(flags.releaseGroup)}`,
            );
        } else if(mode === "interactive") {
        }
            else if(flags.releaseGroup !== undefined) {

            this.log(
                `${chalk.yellow.bold(
                    "\nIMPORTANT",
                )}: This report includes all packages and release groups in the repo. Release versions were selected interactively.`,
            );
        } else if(mode === "date") {
            this.log(
                `${chalk.yellow.bold(
                    "\nIMPORTANT",
                )}: This report includes all packages and release groups in the repo. Release versions were selected interactively.`,
            );
        } else if(mode === "version") {
            this.log(
                `${chalk.yellow.bold(
                    "\nIMPORTANT",
                )}: This report includes all packages and release groups in the repo. Release versions were selected interactively.`,
            );
        }

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

            const isNewRelease = this.isRecentReleaseByDate(latestDate, this.numberBusinessDaysToConsiderRecent);
            const scheme = detectVersionScheme(latestVer);
            const ranges = getRanges(latestVer);

            // Expand the release group to its constituent packages.
            if (isReleaseGroup(pkgName)) {
                for (const pkg of context.packagesInReleaseGroup(pkgName)) {
                    report[pkg.name] = {
                        version: latestVer,
                        versionScheme: scheme,
                        previousVersion: prevVer === DEFAULT_MIN_VERSION ? undefined : prevVer,
                        date: latestDate,
                        releaseType: bumpType,
                        releaseGroup: pkg.monoRepo?.kind,
                        isNewRelease,
                        ranges,
                    };
                }
            } else {
                report[pkgName] = {
                    version: latestVer,
                    versionScheme: scheme,
                    previousVersion: prevVer === DEFAULT_MIN_VERSION ? undefined : prevVer,
                    date: latestDate,
                    releaseType: bumpType,
                    isNewRelease,
                    ranges,
                };
            }
        }

        return report;
    }

    private generateReleaseTable(
        reportData: ReleaseReport,
        initialReleaseGroup?: ReleaseGroup,
    ): string[][] {
        const tableData: string[][] = [];
        const releaseGroups: ReleaseGroup[] = [];

        for (const [pkgName, verDetails] of Object.entries(reportData)) {
            const {
                date: latestDate,
                version: latestVer,
                previousVersion: prevVer,
                releaseGroup,
            } = verDetails;

            let displayName: string | undefined;
            if (releaseGroup !== undefined) {
                displayName =
                    releaseGroup === initialReleaseGroup
                        ? chalk.blue(chalk.bold(releaseGroup))
                        : chalk.bold(releaseGroup);
            }

            const displayDate = getDisplayDate(latestDate);
            const highlight = this.isRecentReleaseByDate(latestDate, this.numberBusinessDaysToConsiderRecent)
                ? chalk.green
                : chalk.white;
            const displayRelDate = highlight(getDisplayDateRelative(latestDate));

            const displayPreviousVersion = prevVer === undefined ? DEFAULT_MIN_VERSION : prevVer;

            const bumpType = detectBumpType(prevVer ?? DEFAULT_MIN_VERSION, latestVer);
            const displayBumpType = highlight(`${bumpType}`);

            const displayVersionSection = chalk.grey(
                `${highlight(latestVer)} <-- ${displayPreviousVersion}`,
            );

            if (releaseGroup === undefined || !releaseGroups.includes(releaseGroup)) {
                tableData.push([
                    displayName ?? pkgName,
                    displayBumpType,
                    displayRelDate,
                    displayDate,
                    displayVersionSection,
                ]);
                if (releaseGroup !== undefined) {
                    releaseGroups.push(releaseGroup);
                }
            }
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
