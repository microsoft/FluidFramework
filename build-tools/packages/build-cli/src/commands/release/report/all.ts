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

import { packageOrReleaseGroupArg } from "../../../args";
import { BaseCommand } from "../../../base";
import { packageSelectorFlag, releaseGroupFlag } from "../../../flags";
import {
    ReleaseReport,
    VersionDetails,
    filterVersionsOlderThan,
    getAllVersions,
    getDisplayDate,
    getDisplayDateRelative,
    sortVersions,
} from "../../../lib";
import { CommandLogger } from "../../../logging";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../../../releaseGroups";
import ReleaseReportCommand, { ReleaseReportBaseCommand } from "../report";

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
export default class ReportAllCommand<
    T extends typeof ReportAllCommand.flags,
> extends ReleaseReportBaseCommand<T> {
    static summary = "Generates a report of all releases of a particular package or release group.";
    static description = `Useful when you want to see all the releases done for a release group or package. The number of results can be limited using the --limit argument.`;

    static examples = [
        {
            description: "List all the releases of the azure release group.",
            command: "<%= config.bin %> <%= command.id %> -g azure",
        },
        {
            description: "List the 10 most recent client releases.",
            command: "<%= config.bin %> <%= command.id %> client --limit 10",
        },
    ];

    static enableJsonFlag = true;
    // static args = [packageOrReleaseGroupArg];
    static flags = {
        // all: Flags.boolean({
        //     description:
        //         "List all releases. Useful when you want to see all the releases done for a release group or package. The number of results can be limited using the --limit argument.",
        //     exclusive: ["output"],
        // }),
        package: packageSelectorFlag({
            exclusive: ["releaseGroup"],
        }),
        limit: Flags.integer({
            char: "l",
            description: `Limits the number of displayed releases for each release group.`,
        }),
        ...ReleaseReportBaseCommand.flags,
    };

    // public async init(): Promise<void> {
    //     await super.init();

    //     const context = await this.getContext();
    //     const flags = this.processedFlags;

    //     const mode = flags.highest ? "version" : flags.mostRecent ? "date" : "interactive";

    //     this.releaseData = await this.collectReleaseData(context, flags.releaseGroup, mode);
    // }

    public async run(): Promise<ReleaseReport[]> {
        const context = await this.getContext();
        const flags = this.processedFlags;
        const reports: ReleaseReport[] = [];

        if (this.releaseData === undefined) {
            this.error(`No releases found for ${flags.releaseGroup}`);
        }

        for (const [pkgOrReleaseGroup, data] of Object.entries(this.releaseData)) {
            const versions = sortVersions([...data.versions], "version");
            const releaseTable = this.generateAllReleasesTable(pkgOrReleaseGroup, versions);

            this.log(
                table(releaseTable, {
                    singleLine: true,
                }),
            );
        }

        // When the --json flag is passed, the command will return the raw data as JSON.
        return reports;
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
