/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ux } from "@oclif/core";
import { command as execCommand } from "execa";
import { parse } from "semver";

import { setVersion } from "@fluid-tools/build-infrastructure";
import { releaseGroupNameFlag, semverFlag } from "../../../flags.js";
// eslint-disable-next-line import/no-internal-modules
import { updateChangelogs } from "../../../library/changelogs.js";
// eslint-disable-next-line import/no-internal-modules
import { canonicalizeChangesets } from "../../../library/changesets.js";
import { BaseCommandWithBuildProject } from "../../../library/index.js";

export default class GenerateChangeLogCommand extends BaseCommandWithBuildProject<
	typeof GenerateChangeLogCommand
> {
	static readonly description = "Generate a changelog for packages based on changesets.";
	static readonly aliases = ["vnext:generate:changelogs"];
	static readonly flags = {
		releaseGroup: releaseGroupNameFlag({ required: true }),
		version: semverFlag({
			description:
				"The version for which to generate the changelog. If this is not provided, the version of the package according to package.json will be used.",
		}),
		...BaseCommandWithBuildProject.flags,
	} as const;

	static readonly examples = [
		{
			description: "Generate changelogs for the client release group.",
			command: "<%= config.bin %> <%= command.id %> --releaseGroup client",
		},
	];

	public async run(): Promise<void> {
		const buildProject = this.getBuildProject();

		const { releaseGroup: releaseGroupName } = this.flags;

		const releaseGroup = buildProject.releaseGroups.get(releaseGroupName);
		if (releaseGroup === undefined) {
			this.error(`Can't find release group named '${releaseGroupName}'`, { exit: 1 });
		}

		const releaseGroupRoot = releaseGroup.workspace.directory;
		const releaseGroupVersion = parse(releaseGroup.version);
		if (releaseGroupVersion === null) {
			this.error(`Version isn't a valid semver string: '${releaseGroup.version}'`, {
				exit: 1,
			});
		}

		// Strips additional custom metadata from the source files before we call `changeset version`,
		// because the changeset tools - like @changesets/cli - only work on canonical changesets.
		const bumpType = await canonicalizeChangesets(releaseGroupRoot, this.logger);

		// The `changeset version` command applies the changesets to the changelogs
		ux.action.start("Running `changeset version`");
		await execCommand("pnpm exec changeset version", { cwd: releaseGroupRoot });
		ux.action.stop();

		const packagesToCheck = releaseGroup.packages;

		// restore the package versions that were changed by `changeset version`
		await setVersion(packagesToCheck, releaseGroupVersion);

		// Calls processPackage on all packages.
		ux.action.start("Processing changelog updates");
		const processPromises: Promise<void>[] = [];
		for (const pkg of packagesToCheck) {
			processPromises.push(updateChangelogs(pkg, bumpType));
		}
		const results = await Promise.allSettled(processPromises);
		const failures = results.filter((p) => p.status === "rejected");
		if (failures.length > 0) {
			this.error(
				`Error processing packages; failure reasons:\n${failures
					.map((p) => (p as PromiseRejectedResult).reason as string)
					.join(", ")}`,
				{ exit: 1 },
			);
		}
		ux.action.stop();

		this.log("Commit and open a PR!");
	}
}
