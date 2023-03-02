/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { PackageJson } from "@fluidframework/build-tools";
import { ux, Flags, Command } from "@oclif/core";
import async from "async";
import { readJSONSync } from "fs-extra";
import assert from "node:assert";
import path from "node:path";

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
		private: Flags.boolean({
			description: "Only include private packages (or non-private packages for --no-private)",
			exclusive: ["skipPrivate"],
			allowNo: true,
		}),
		scope: Flags.string({
			description: "Package scopes to filter to.",
			exclusive: ["skipScope"],
			multiple: true,
		}),
		skipScope: releaseGroupFlag({
			description: "Package scopes to filter out.",
			exclusive: ["scope"],
			multiple: true,
		}),
		...BaseCommand.flags,
	};

	protected abstract processPackage(directory: string): Promise<void>;

	private async processPackages(directories: string[]): Promise<void> {
		const scopeIn = scopesToPrefix(this.flags.scope);
		const scopeOut = scopesToPrefix(this.flags.skipScope);

		const packages = directories.filter((directory) => {
			const json: PackageJson = readJSONSync(path.join(directory, "package.json"));
			const isPrivate: boolean = json.private ?? false;
			if (this.flags.private !== undefined && this.flags.private !== isPrivate) {
				return false;
			}
			if (scopeIn !== undefined) {
				let found = false;
				for (const scope of scopeIn) {
					found ||= json.name?.startsWith(scope) ?? false;
				}
				if (!found) return false;
			}
			if (scopeOut !== undefined) {
				for (const scope of scopeOut) {
					if (json.name?.startsWith(scope) ?? false) {
						return false;
					}
				}
			}
			return true;
		});

		let started = 0;
		let finished = 0;
		let succeeded = 0;
		// In verbose mode, we output a log line per package. In non-verbose mode, we want to display an activity
		// spinner, so we only start the spinner if verbose is false.
		const verbose = this.flags.verbose;

		if (verbose) {
			this.info(`Filtered ${listNames(directories)} packages to ${listNames(packages)}`);
		}

		function updateStatus(): void {
			if (!verbose) {
				ux.action.start(
					"Processing Packages...",
					`${finished}/${packages.length}: ${started - finished} pending. Errors: ${
						finished - succeeded
					}`,
					{
						stdout: true,
					},
				);
			}
		}
		try {
			await async.mapLimit(packages, 25, async (directory) => {
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
				ux.action.stop(`Done. ${packages.length} Packages. ${finished - succeeded} Errors`);
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

function scopesToPrefix(scopes: undefined | string[]): string[] | undefined {
	return scopes === undefined ? undefined : scopes.map((s) => `${s}/`);
}

function listNames(strings: string[]): string {
	return strings.length > 10 ? `${strings.length}` : `${strings.length} (${strings.join(", ")})`;
}
