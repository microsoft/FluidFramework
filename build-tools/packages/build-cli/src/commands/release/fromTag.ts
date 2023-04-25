/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Args } from "@oclif/core";
import semver from "semver";

import { sortVersions } from "../../lib";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../../releaseGroups";
import { ReleaseReportBaseCommand, ReleaseSelectionMode } from "./report";
import { ReleaseVersion, VersionBumpType, detectBumpType } from "@fluid-tools/version-tools";

/**
 * The `release fromTag` command is used to get release information from a git tag.
 *
 */
export default class FromTagCommand extends ReleaseReportBaseCommand<typeof FromTagCommand> {
	static summary = "Determines release information based on a git tag argument.";

	static description =
		"This command is used in CI to determine release information when a new release tag is pushed.";

	static enableJsonFlag = true;

	static args = {
		tag: Args.string({
			required: true,
			description: "A git tag that represents a release. May begin with 'refs/tags/'.",
		}),
	};

	defaultMode: ReleaseSelectionMode = "inRepo";
	releaseGroupOrPackage: ReleaseGroup | ReleasePackage | undefined;

	static examples = [
		{
			description: "You can use the --versions (-r) flag multiple times.",
			command: "<%= config.bin %> <%= command.id %> refs/tags/build-tools_v0.13.0",
		},
		{
			description:
				"You can omit the repeated --versions (-r) flag and pass a space-delimited list instead.",
			command:
				"<%= config.bin %> <%= command.id %> -r 2.0.0 2.0.0-internal.1.0.0 1.0.0 0.56.1000",
		},
	];

	async run(): Promise<{
		packageOrReleaseGroup: ReleaseGroup | ReleasePackage;
		tag: string;
		date?: Date;
		releaseType: VersionBumpType;
		version: ReleaseVersion;
		previousVersion?: ReleaseVersion;
		previousTag?: string;
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
		this.verbose(JSON.stringify(release, undefined, 2));

		const versions = sortVersions([...release.versions], "version");
		const taggedReleaseIndex = versions.findIndex((v) => v.version === version.version);
		if (taggedReleaseIndex === -1) {
			this.error(`Release matching version '${version.version}' not found`);
		}
		const prevVersionDetails = versions[taggedReleaseIndex + 1];
		this.warning(
			`Previous index: ${taggedReleaseIndex + 1} version: ${prevVersionDetails?.version}`,
		);
		if (prevVersionDetails === undefined) {
			this.error(`No previous release found`);
		}

		const releaseType = detectBumpType(prevVersionDetails?.version, version);
		if (releaseType === undefined) {
			this.error(
				`Unable to determine release type for ${prevVersionDetails?.version} -> ${version.version}`,
			);
		}

		this.log(`${this.releaseGroupOrPackage} v${version.version} (${releaseType})`);

		// When the --json flag is passed, the command will return the raw data as JSON.
		const previousVersion = prevVersionDetails?.version;
		return {
			packageOrReleaseGroup: this.releaseGroupOrPackage,
			tag,
			date: release.latestReleasedVersion.date,
			releaseType,
			version: version.version,
			previousVersion,
			previousTag:
				prevVersionDetails === undefined
					? undefined
					: `${this.releaseGroupOrPackage}_v${previousVersion}`,
		};
	}
}

const pre = "refs/tags/";

/**
 * Parses a git tag string into a release group and a semver version.
 * @param input - A git tag as a string.
 * @returns A 3-tuple of the release group, the semver version, and the original tag.
 */
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
