/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ux, Flags, Command } from "@oclif/core";
import async from "async";
import assert from "node:assert";

import { BaseCommand } from "./base";
import { releaseGroupFlag } from "./flags";

/**
 * Commands that run operations per project.
 */
export abstract class PackageCommand<
	T extends typeof Command & { flags: typeof PackageCommand.flags },
> extends BaseCommand<T> {
	static flags = {
		dir: Flags.directory({
			char: "d",
			description:
				"Run on the package in this directory. Cannot be used with --releaseGroup or --packages.",
			exclusive: ["packages", "releaseGroup"],
		}),
		packages: Flags.boolean({
			description:
				"Run on all independent packages in the repo. This is an alternative to using the --dir flag for independent packages.",
			default: false,
			exclusive: ["dir", "releaseGroup"],
		}),
		releaseGroup: releaseGroupFlag({
			description:
				"Run on all packages within this release group. Cannot be used with --dir or --packages.",
			exclusive: ["dir", "packages"],
		}),
		...BaseCommand.flags,
	};

	protected abstract processPackage(directory: string): Promise<void>;

	private async processPackages(directories: string[]): Promise<void> {
		let started = 0;
		let finished = 0;
		let succeeded = 0;
		// In verbose mode, we output a log line per package. In non-verbose mode, we want to display an activity
		// spinner, so we only start the spinner if verbose is false.
		const verbose = this.flags.verbose;
		function updateStatus(): void {
			if (!verbose) {
				ux.action.start(
					"Processing Packages...",
					`${finished}/${directories.length}: ${started - finished} pending. Errors: ${
						finished - succeeded
					}`,
					{
						stdout: true,
					},
				);
			}
		}
		try {
			await async.mapLimit(directories, 25, async (directory) => {
				started += 1;
				updateStatus();
				try {
					await this.processPackage(directory);
					succeeded += 1;
				} finally {
					finished += 1;
					updateStatus();
				}
			});
		} finally {
			// Stop the spinner if needed.
			if (!verbose) {
				ux.action.stop(
					`Done. ${directories.length} Packages. ${finished - succeeded} Errors`,
				);
			}
		}
	}

	public async run(): Promise<void> {
		const flags = this.flags;

		const releaseGroup = flags.releaseGroup;
		const independentPackages = flags.packages;
		const dir = flags.dir;

		if (dir !== undefined) {
			return this.processPackages([dir]);
		}

		if (flags.releaseGroup === undefined && flags.packages === false) {
			return this.processPackages(["."]);
		}

		const ctx = await this.getContext();
		if (releaseGroup !== undefined) {
			this.info(`Finding packages for release group: ${releaseGroup}`);
			return this.processPackages(
				ctx.packagesInReleaseGroup(releaseGroup).map((p) => p.directory),
			);
		}
		assert(independentPackages);
		this.info(`Finding independent packages`);
		return this.processPackages(ctx.independentPackages.map((p) => p.directory));
	}
}
