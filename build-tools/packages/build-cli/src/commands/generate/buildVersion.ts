/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";

import { getIsLatest, getSimpleVersion } from "@fluid-tools/version-tools";

import { BaseCommand } from "../../base";

/**
 * This command class is used to compute the version number of Fluid packages. The release version number is based on
 * what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the
 * prerelease suffix if it is not a tagged build.
 */
export default class GenerateBuildVersionCommand extends BaseCommand<
	typeof GenerateBuildVersionCommand
> {
	static readonly description = `This command is used to compute the version number of Fluid packages. The release version number is based on what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease suffix if it is not a tagged build`;

	static readonly examples = ["<%= config.bin %> <%= command.id %>"];

	static readonly flags = {
		build: Flags.string({
			description: "The CI build number.",
			env: "VERSION_BUILDNUMBER",
			required: true,
		}),
		testBuild: Flags.string({
			description: "Indicates the build is a test build.",
			env: "TEST_BUILD",
		}),
		release: Flags.string({
			description: "Indicates the build is a release build.",
			options: ["release", "prerelease", "none"],
			env: "VERSION_RELEASE",
		}),
		patch: Flags.string({
			description: `Indicates the build should use "simple patch versioning" where the value of the --build flag is used as the patch version.`,
			env: "VERSION_PATCH",
		}),
		base: Flags.string({
			description:
				"The base version. This will be read from lerna.json/package.json if not provided.",
		}),
		tag: Flags.string({
			description: "The tag name to use.",
			env: "VERSION_TAGNAME",
		}),
		includeInternalVersions: Flags.string({
			char: "i",
			description: "Include Fluid internal versions.",
			env: "VERSION_INCLUDE_INTERNAL_VERSIONS",
		}),
		packageTypes: Flags.string({
			description:
				"If provided, the version generated will include extra strings based on the TypeScript types that are expected to be used. This flag should only be used in the Fluid Framework CI pipeline.",
			options: ["none", "alpha", "beta", "public", "untrimmed"],
			default: "none",
			env: "PACKAGE_TYPES_FIELD",
		}),
		fileVersion: Flags.string({
			description:
				"Will be used as the version instead of reading from package.json/lerna.json. Used for testing.",
			hidden: true,
		}),
		tags: Flags.string({
			description:
				"The git tags to consider when determining whether a version is latest. Used for testing.",
			hidden: true,
			multiple: true,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { flags } = this;
		const isRelease = flags.release === "release";
		const useSimplePatchVersion = flags.patch?.toLowerCase() === "true";
		const useTestVersion = flags.testBuild?.toLowerCase() === "true";
		const shouldIncludeInternalVersions =
			flags.includeInternalVersions?.toLowerCase() === "true";
		const isAlphaOrBetaTypes = ["alpha", "beta"].includes(flags.packageTypes);
		// `alphabetaTypePrefix` will be either `alpha-types` or `beta-types`
		const alphabetaTypePrefix = `${flags.packageTypes}-types`;

		let fileVersion = "";

		if (flags.base === undefined) {
			fileVersion = flags.fileVersion ?? this.getFileVersion();
			if (!fileVersion) {
				this.error("Missing version in lerna.json/package.json");
			}
		}

		if (flags.testBuild?.toLowerCase() === "true" && isRelease) {
			this.error("Test build shouldn't be released");
		}

		if (!useSimplePatchVersion && flags.tag !== undefined) {
			const tagName = `${flags.tag}_v${fileVersion}`;
			const out = childProcess.execSync(`git tag -l ${tagName}`, { encoding: "utf8" });
			if (out.trim() === tagName) {
				if (isRelease) {
					this.error(`Tag ${tagName} already exists.`);
				}

				this.warning(`Tag ${tagName} already exists.`);
			}
		}

		// Generate and print the version to console
		const simpleVersion = getSimpleVersion(
			fileVersion,
			flags.build,
			isRelease,
			useSimplePatchVersion,
		);

		let version = simpleVersion;

		if (useTestVersion) {
			// Determine the version string for test builds.
			// If it's an alpha or beta type, append `alphabetaTypePrefix`.
			version = isAlphaOrBetaTypes
				? `0.0.0-${flags.build}-test-${alphabetaTypePrefix}`
				: `0.0.0-${flags.build}-test`;

			// Output the code version for test builds. This is used in the CI system.
			// See common/build/build-common/gen_version.js
			const codeVersion = isAlphaOrBetaTypes
				? `${simpleVersion}-test-${alphabetaTypePrefix}`
				: `${simpleVersion}-test`;
			this.log(`codeVersion=${codeVersion}`);
			this.log(`##vso[task.setvariable variable=codeVersion;isOutput=true]${codeVersion}`);
		}

		if (isAlphaOrBetaTypes) {
			if (isRelease || flags.release === "none") {
				this.errorLog(
					"This release type is not supported. Alpha/beta ***prereleases*** are allowed.",
				);
				this.exit(1);
			} else if (!useTestVersion) {
				// For prereleases, update the version string with `alphabetaTypePrefix` prefix.
				version = `${simpleVersion}-${alphabetaTypePrefix}`;
			}
		}

		this.log(`version=${version}`);
		this.log(`##vso[task.setvariable variable=version;isOutput=true]${version}`);

		const context = await this.getContext();
		const tags = flags.tags ?? (await context.gitRepo.getAllTags());
		if (flags.tag !== undefined) {
			const isLatest = getIsLatest(
				flags.tag,
				version,
				tags,
				shouldIncludeInternalVersions,
				true,
			);
			this.log(`isLatest=${isLatest}`);
			if (isRelease && isLatest === true) {
				this.log(`##vso[task.setvariable variable=isLatest;isOutput=true]${isLatest}`);
			}
		}
	}

	private getFileVersion(): string {
		if (fs.existsSync("./lerna.json")) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			return JSON.parse(fs.readFileSync("./lerna.json", { encoding: "utf8" }))
				.version as string;
		}

		if (fs.existsSync("./package.json")) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			return JSON.parse(fs.readFileSync("./package.json", { encoding: "utf8" }))
				.version as string;
		}

		this.error(`lerna.json or package.json not found`);
	}
}
