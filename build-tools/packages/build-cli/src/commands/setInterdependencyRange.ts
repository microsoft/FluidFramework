/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Args } from "@oclif/core";
import chalk from "chalk";

import { MonoRepo } from "@fluidframework/build-tools";

import {
	RangeOperators,
	WorkspaceRanges,
	isInterdependencyRange,
} from "@fluid-tools/version-tools";

import { findPackageOrReleaseGroup } from "../args.js";
import { BaseCommand } from "../library/index.js";
import { type DependencyWithRange, setPackageDependencies } from "../library/index.js";

export default class SetInterdependencyRangeCommand extends BaseCommand<
	typeof SetInterdependencyRangeCommand
> {
	static readonly summary = "Modifies the interdependency range used within a release group.";
	static readonly description =
		`Used by the release process to set the interdependency range in published packages.`;

	static readonly args = {
		group: Args.string({
			description:
				"The release group to modify. If a package is provided instead of a group, the command is a no-op.",
			required: true,
		}),
		interdependencyRange: Args.string({
			description:
				'Controls the type of dependency that is used between packages within the release group. Use "" (the empty string) to indicate exact dependencies.',
			options: [...RangeOperators, ...WorkspaceRanges],
			required: true,
		}),
	} as const;

	public async run(): Promise<void> {
		const { args } = this;

		const context = await this.getContext();
		const releaseRepo = findPackageOrReleaseGroup(args.group, context);
		if (releaseRepo === undefined) {
			this.error(`Release Group not found: ${args.group}`);
		} else if (!(releaseRepo instanceof MonoRepo)) {
			this.warning(
				`Found package not release group. Since packages have no interdependencies no changes will be made.`,
			);
			return;
		}

		const newRange = `${args.interdependencyRange}${releaseRepo.version}`;

		this.logHr();
		this.log(`Release group: ${chalk.blueBright(releaseRepo.name)}`);
		this.log(`Interdependency range: ${newRange}`);
		if (!isInterdependencyRange(newRange)) {
			this.error("Invalid Interdependency range");
		}
		this.logHr();

		this.log(`Updating dependencies...`);

		const dependencyVersionMap = new Map<string, DependencyWithRange>();
		for (const pkg of releaseRepo.packages) {
			dependencyVersionMap.set(pkg.name, { pkg, range: newRange });
		}

		await Promise.all(
			releaseRepo.packages.map(async (pkg) =>
				setPackageDependencies(
					pkg,
					dependencyVersionMap,
					/* updateWithinSameReleaseGroup */ true,
				),
			),
		);
		this.log(`Update complete`);
	}
}
