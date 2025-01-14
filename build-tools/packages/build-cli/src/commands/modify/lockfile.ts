/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { updatePackageJsonFile } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import execa from "execa";

import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args.js";
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
		dependencyName: Flags.string({
			description: "Name of the dependency (npm package) to update.",
			required: true,
		}),
		version: Flags.string({
			description:
				"A semver version or range specifier (e.g. ^1.2.3) to use when updating the dependency.",
			required: true,
			// Future improvement: use 'parse:' to validate that this is a valid semver range.
		}),
	};

	public static readonly args = {
		package_or_release_group: packageOrReleaseGroupArg({
			description:
				"The name of a package or a release group. Defaults to the client release group if not specified.",
			default: "client",
		}),
	} as const;

	public async run(): Promise<void> {
		const context = await this.getContext();

		const rgArg = this.args.package_or_release_group;
		const pkgOrReleaseGroup = findPackageOrReleaseGroup(rgArg, context);
		if (pkgOrReleaseGroup === undefined) {
			this.error(`Can't find package or release group "${rgArg}"`, { exit: 1 });
		}
		this.verbose(`Release group or package found: ${pkgOrReleaseGroup.name}`);

		// Add override to package.json
		this.info(
			`Adding pnpm override for ${this.flags.dependencyName}: ${this.flags.version} to package.json`,
		);
		updatePackageJsonFile(pkgOrReleaseGroup.directory, (json) => {
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
			cwd: pkgOrReleaseGroup.directory,
		});

		// Remove override after install
		this.info(`Restoring package.json to original state`);
		await execa(`git`, [`restore`, `--source=HEAD`, `package.json`], {
			cwd: pkgOrReleaseGroup.directory,
		});

		// Install again to remove the override from the lockfile
		this.info(`Updating lockfile to remove override`);
		await execa(`pnpm`, [`install`, `--no-frozen-lockfile`], {
			cwd: pkgOrReleaseGroup.directory,
		});
	}
}
