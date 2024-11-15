/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import chalk from "picocolors";
import { table } from "table";

import {
	ReleaseReport,
	VersionDetails,
	getDisplayDate,
	getDisplayDateRelative,
	sortVersions,
} from "../../library/index.js";

import { detectBumpType } from "@fluid-tools/version-tools";

import { findPackageOrReleaseGroup } from "../../args.js";
import { packageSelectorFlag, releaseGroupFlag } from "../../flags.js";
import { ReleaseGroup, ReleasePackage } from "../../releaseGroups.js";
import { ReleaseReportBaseCommand, ReleaseSelectionMode } from "./report.js";

const DEFAULT_MIN_VERSION = "0.0.0";

/**
 * Prints a list of released versions of a package or release group. Releases are gathered from the git tags in repo
 * containing the working directory.
 *
 * @remarks
 * Use 'npm view' to list published packages based on the public npm registry.
 *
 * The number of results can be limited using the --limit argument.
 */
export default class ReleaseHistoryCommand extends ReleaseReportBaseCommand<
	typeof ReleaseHistoryCommand
> {
	static readonly description =
		`Prints a list of released versions of a package or release group. Releases are gathered from the git tags in repo containing the working directory.

    Use 'npm view' to list published packages based on the public npm registry.

    The number of results can be limited using the --limit argument.`;

	static readonly examples = [
		{
			description: "List all the releases of the azure release group.",
			command: "<%= config.bin %> <%= command.id %> -g azure",
		},
		{
			description: "List the 10 most recent client releases.",
			command: "<%= config.bin %> <%= command.id %> -g client --limit 10",
		},
	];

	static readonly flags = {
		releaseGroup: releaseGroupFlag({
			required: false,
			exclusive: ["package"],
		}),
		package: packageSelectorFlag({
			required: false,
			exclusive: ["releaseGroup"],
		}),
		limit: Flags.integer({
			char: "l",
			description: `Limits the number of displayed releases for each release group. Results are sorted by semver, so '--limit 10' will return the 10 highest semver releases for the release group.`,
		}),
		...ReleaseReportBaseCommand.flags,
	};

	static readonly enableJsonFlag = true;

	readonly defaultMode: ReleaseSelectionMode = "date";
	releaseGroupName: ReleaseGroup | ReleasePackage | undefined;

	public async run(): Promise<{ reports: ReleaseReport[] }> {
		const context = await this.getContext();
		const { defaultMode, flags } = this;

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const releaseGroup = flags.releaseGroup ?? flags.package!;
		this.releaseGroupName = findPackageOrReleaseGroup(releaseGroup, context)?.name;
		if (this.releaseGroupName === undefined) {
			this.error(`Can't find release group or package with name: ${releaseGroup}`, {
				exit: 1,
			});
		}

		this.releaseData = await this.collectReleaseData(
			context,
			defaultMode,
			this.releaseGroupName,
			false,
		);
		if (this.releaseData === undefined) {
			this.error(`No releases found for ${this.releaseGroupName}`);
		}

		const reports: ReleaseReport[] = [];

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
		return { reports };
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

			const displayVersionSection = chalk.gray(
				`${highlight(ver.version)} <-- ${displayPreviousVersion}`,
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

		const { limit } = this.flags;
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
