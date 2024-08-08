/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { updatePackageJsonFile } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import execa from "execa";

import { releaseGroupFlag } from "../../flags.js";
import { BaseCommand } from "../../library/index.js";

/**
 * Updates the version of a dependency in the lockfile.
 *
 * @remarks
 * This command is primarily used manually to update transitive dependencies when we need to address CVEs.
 *
 * Note that this applies to all packages in the specified release group.
 */
export default class UpdateDependencyInLockfileCommand extends BaseCommand<
	typeof UpdateDependencyInLockfileCommand
> {
	static readonly summary =
		"Updates a dependency in the pnpm lockfile to the latest version of a specified semver range.";

	static readonly description =
		`Note that if the version passed in to the command is not within the range of versions ` +
		`naturally accepted by the packages that depend on it, after this command runs the lockfile might not reflect the ` +
		`version that was passed in, but the latest version that complies with the semver range declared by the dependent packages.`;

	static readonly enableJsonFlag = true;

	static readonly flags = {
		releaseGroup: releaseGroupFlag({ required: true }),
		dependencyName: Flags.string({
			description: "Name of the dependency (npm package) to update.",
			required: true,
		}),
		version: Flags.string({
			description: "Semver range specifier to use when updating the dependency.",
			required: true,
			// Future improvement: use 'parse:' to validate that this is a valid semver range.
		}),
	};

	public async run(): Promise<void> {
		const context = await this.getContext();
		const releaseGroup = context.repo.releaseGroups.get(this.flags.releaseGroup);

		if (releaseGroup === undefined) {
			// exits the process
			this.error(`Can't find release group: ${this.flags.releaseGroup}`, { exit: 1 });
		}

		// Add override to package.json
		this.info(
			`Adding pnpm override for ${this.flags.dependencyName}: ${this.flags.version} to package.json`,
		);
		updatePackageJsonFile(releaseGroup.directory, (json) => {
			if (json.pnpm === undefined) {
				json.pnpm = {};
			}
			if (json.pnpm.overrides === undefined) {
				json.pnpm.overrides = {};
			}
			const currentOverrideVersion = json.pnpm.overrides[this.flags.dependencyName] as
				| string
				| undefined;
			if (currentOverrideVersion !== undefined) {
				this.error(
					`A pnpm override for the specified dependency already exists (${this.flags.dependencyName}: "${currentOverrideVersion}". Cannot continue.`,
					{ exit: 1 },
				);
			}
			json.pnpm.overrides[this.flags.dependencyName] = this.flags.version;
		});

		// Update lockfile
		this.info(`Updating lockfile`);
		await execa(`pnpm`, [`install`, `--no-frozen-lockfile`], {
			cwd: releaseGroup.directory,
		});

		// Remove override after install
		this.info(`Restoring package.json to original state`);
		await execa(`git`, [`restore`, `--source=HEAD`, `package.json`], {
			cwd: releaseGroup.directory,
		});

		// Install again to remove the override from the lockfile
		this.info(`Updating lockfile to remove override`);
		await execa(`pnpm`, [`install`, `--no-frozen-lockfile`], {
			cwd: releaseGroup.directory,
		});
	}
}
