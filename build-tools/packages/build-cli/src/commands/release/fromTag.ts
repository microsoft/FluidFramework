/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Args, Flags } from "@oclif/core";
import semver from "semver";

import { sortVersions } from "../../lib";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../../releaseGroups";
import { ReleaseReportBaseCommand, ReleaseSelectionMode } from "./report";
import { ReleaseVersion, VersionBumpType, detectBumpType } from "@fluid-tools/version-tools";

/**
 * The `version latest` command is used to find the latest (highest) version in a list of versions. The command takes
 * the Fluid internal version scheme into account, and handles prerelease versions properly.
 *
 * Once scenario where this is useful is for Fluid customers who want to consume the most recent version from npm. The
 * standard tools (e.g. `npm show versions`) don't fully work in that scenario because the Fluid internal version scheme
 * overloads the semver prerelease field.
 */
export default class FromTagCommand extends ReleaseReportBaseCommand<typeof FromTagCommand> {
	static description = "Determines release information from a git tag.";

	static enableJsonFlag = true;

	static args = {
		tag: Args.string({
			required: true,
			description: "A git tag that represents a release.",
		}),
	};

	defaultMode: ReleaseSelectionMode = "inRepo";
	releaseGroupOrPackage: ReleaseGroup | ReleasePackage | undefined;

	static flags = {
		releaseType: Flags.boolean({
			default: false,
			exclusive: ["releaseGroup", "version"],
		}),
		releaseGroup: Flags.boolean({
			default: false,
			exclusive: ["releaseType", "version"],
		}),
		version: Flags.boolean({
			default: false,
			exclusive: ["releaseGroup", "releaseType"],
		}),
	};

	// static examples = [
	// 	{
	// 		description: "You can use the --versions (-r) flag multiple times.",
	// 		command:
	// 			"<%= config.bin %> <%= command.id %> -r 2.0.0 -r 2.0.0-internal.1.0.0 -r 1.0.0 -r 0.56.1000",
	// 	},
	// 	{
	// 		description:
	// 			"You can omit the repeated --versions (-r) flag and pass a space-delimited list instead.",
	// 		command:
	// 			"<%= config.bin %> <%= command.id %> -r 2.0.0 2.0.0-internal.1.0.0 1.0.0 0.56.1000",
	// 	},
	// ];

	async run(): Promise<{
		packageOrReleaseGroup: ReleaseGroup | ReleasePackage;
    tag: string;
    date?: Date;
		releaseType: VersionBumpType;
		version: ReleaseVersion;
	}> {
		const tagInput = this.args.tag;
		const context = await this.getContext();

		const [releaseGroup, version, tag] = parseTag(tagInput);
		this.releaseGroupOrPackage = releaseGroup;

		this.releaseData = await this.collectReleaseData(
			context,
			this.defaultMode,
			this.releaseGroupOrPackage,
			false,
		);

		const release = this.releaseData[this.releaseGroupOrPackage];

		const versions = sortVersions([...release.versions], "version");
		const taggedReleaseIndex = versions.findIndex((v) => v.version === version.version);
		if (taggedReleaseIndex === -1) {
			this.error(`Release matching version '${version.version}' not found`);
		}
		const prevVersion = release.previousReleasedVersion;
		if (prevVersion === undefined) {
			this.error(`No previous release found`);
		}

		const releaseType = detectBumpType(prevVersion?.version, version);
		if (releaseType === undefined) {
			this.error(
				`Unable to determine release type for ${prevVersion?.version} -> ${version.version}`,
			);
		}

		if (this.flags.releaseGroup) {
			this.log(this.releaseGroupOrPackage);
		} else if (this.flags.version) {
			this.log(version.version);
		} else if (this.flags.releaseType) {
			this.log(releaseType);
		} else {
			this.log(`${this.releaseGroupOrPackage} v${version.version} (${releaseType})`);
		}

		// When the --json flag is passed, the command will return the raw data as JSON.
		return {
			packageOrReleaseGroup: this.releaseGroupOrPackage,
      tag,
      date: release.latestReleasedVersion.date,
			releaseType,
			version: version.version,
		};
	}
}

const pre = "refs/tags/";

const parseTag = (input: string): [ReleaseGroup, semver.SemVer, string] => {
	const tag = input.startsWith(pre) ? input.slice(pre.length) : input;
	const [rg, ver] = tag.split("_v");
	if (!isReleaseGroup(rg)) {
		throw new Error(`Unknown release group parsed from tag: ${rg}`);
	}

	const version = semver.parse(ver);
	if (version === null) {
		throw new Error(`Invalid version parsed from tag: ${ver}`);
	}

	return [rg, version, tag];
};
