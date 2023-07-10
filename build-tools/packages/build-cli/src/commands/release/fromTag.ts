/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { MonoRepoKind } from "@fluidframework/build-tools";
import { ReleaseVersion, VersionBumpType, detectBumpType } from "@fluid-tools/version-tools";
import { Args } from "@oclif/core";
import semver from "semver";
import { sortPackageJson as sortJson } from "sort-package-json";

import { sortVersions } from "../../lib";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../../releaseGroups";
import { ReleaseReportBaseCommand, ReleaseSelectionMode } from "./report";

/**
 * The `release fromTag` command is used to get release information from a git tag.
 *
 * This command is used in CI to determine release information when a new release tag is pushed.
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
			description: "Get release information based on a git tag.",
			command: "<%= config.bin %> <%= command.id %> build-tools_v0.13.0",
		},
		{
			description: "You can include the refs/tags/ part of a tag ref.",
			command: "<%= config.bin %> <%= command.id %> refs/tags/2.0.0-internal.2.0.2",
		},
	];

	async run(): Promise<{
		packageOrReleaseGroup: ReleaseGroup | ReleasePackage;
		title: string;
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
		const versions = sortVersions([...release.versions], "version");
		const taggedReleaseIndex = versions.findIndex((v) => v.version === version.version);
		if (taggedReleaseIndex === -1) {
			this.error(`Release matching version '${version.version}' not found`);
		}

		const prevVersionDetails = versions[taggedReleaseIndex + 1];
		if (prevVersionDetails === undefined) {
			this.error(`No previous release found`);
		}

		const previousVersion = prevVersionDetails?.version;
		const releaseType = detectBumpType(previousVersion, version);
		if (releaseType === undefined) {
			this.error(
				`Unable to determine release type for ${previousVersion} -> ${version.version}`,
			);
		}

		this.log(`${this.releaseGroupOrPackage} v${version.version} (${releaseType})`);

		// When the --json flag is passed, the command will return the raw data as JSON.
		return sortJson({
			packageOrReleaseGroup: this.releaseGroupOrPackage,
			title: getReleaseTitle(releaseGroup, version, releaseType),
			tag,
			date: release.latestReleasedVersion.date,
			releaseType,
			version: version.version,
			previousVersion,
			previousTag:
				prevVersionDetails === undefined
					? undefined
					: `${this.releaseGroupOrPackage}_v${previousVersion}`,
		});
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

const getReleaseTitle = (
	releaseGroup: ReleaseGroup,
	version: semver.SemVer,
	releaseType: VersionBumpType,
): string => {
	const name = releaseGroup === MonoRepoKind.Client ? "Fluid Framework" : releaseGroup;
	// e.g. Fluid Framework v2.0.0-internal.4.1.0 (minor)
	return `${name} v${version} (${releaseType})`;
};
