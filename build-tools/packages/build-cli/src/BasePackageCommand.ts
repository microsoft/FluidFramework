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
import { ReleaseGroup } from "./releaseGroups";

/**
 * A type indicating the kind of package that is being processed. This enables subcommands to vary behavior based on the
 * type of package.
 */
type PackageKind =
	/**
	 * Package is an independent package.
	 */
	| "independentPackage"

	/**
	 * Package is part of a release group
	 */
	| "releaseGroupPackage"

	/**
	 * Package is the root package of a release group.
	 */
	| "releaseGroupRoot"

	/**
	 * Package is being loaded from a directory. The package may be one of the other three kinds. This kind is only used
	 * when running on a package diurectly using its directory.
	 */
	| "packageDir";

/**
 * Commands that run operations per project.
 */
export abstract class PackageCommand<
	T extends typeof Command & { flags: typeof PackageCommand.flags },
> extends BaseCommand<T> {
	static flags = {
		all: Flags.boolean({
			char: "a",
			description:
				"Run on all packages and release groups. Cannot be used with --dir, --packages, or --releaseGroup.",
			exclusive: ["dir", "packages", "releaseGroup"],
		}),
		dir: Flags.directory({
			char: "d",
			description:
				"Run on the package in this directory. Cannot be used with --all, --packages, or --releaseGroup.",
			exclusive: ["packages", "releaseGroup", "all"],
		}),
		packages: Flags.boolean({
			description:
				"Run on all independent packages in the repo. Cannot be used with --all, --dir, or --releaseGroup.",
			default: false,
			exclusive: ["dir", "releaseGroup", "all"],
		}),
		releaseGroup: releaseGroupFlag({
			description:
				"Run on all packages within this release group. Cannot be used with --all, --dir, or --packages.",
			exclusive: ["all", "dir", "packages"],
		}),
		releaseGroupRoots: Flags.boolean({
			description:
				"Runs only on the root package of release groups. Can only be used with --all or --releaseGroup.",
			relationships: [
				{ type: "some", flags: ["all", "releaseGroup"] },
				{ type: "none", flags: ["dir", "packages"] },
			],
		}),
		private: Flags.boolean({
			description: "Only include private packages (or non-private packages for --no-private)",
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

	protected abstract processPackage(
		directory: string,
		packageDetails: { kind: PackageKind },
	): Promise<void>;

	private async processPackages(
		directories: string[],
		packageDetails: { kind: PackageKind },
	): Promise<void> {
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
					await this.processPackage(directory, packageDetails);
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

	/**
	 * Runs processPackage for each package in a release group, exlcuding the root.
	 */
	private async processReleaseGroup(
		releaseGroup: ReleaseGroup,
		rootPackageOnly: boolean,
	): Promise<void> {
		this.info(`Finding packages for release group: ${releaseGroup}`);
		const ctx = await this.getContext();
		if (rootPackageOnly) {
			const rg = ctx.repo.releaseGroups.get(releaseGroup);
			assert(rg !== undefined);
			return this.processPackages([rg.repoPath], { kind: "releaseGroupRoot" });
		}

		return this.processPackages(
			ctx.packagesInReleaseGroup(releaseGroup).map((p) => p.directory),
			{ kind: "releaseGroupPackage" },
		);
	}

	/**
	 * Runs processPackage for each independent package in the repo.
	 */
	private async processIndependentPackages(): Promise<void> {
		const ctx = await this.getContext();
		this.info(`Finding independent packages`);
		return this.processPackages(
			ctx.independentPackages.map((p) => p.directory),
			{ kind: "independentPackage" },
		);
	}

	public async run(): Promise<void> {
		const flags = this.flags;

		const { all, dir, releaseGroup, releaseGroupRoots, packages } = flags;

		const ctx = await this.getContext();
		if (all) {
			// for each release group, run on its root or all its packages based on the releaseGroupRoots
			const releaseGroupPromises = [...ctx.repo.releaseGroups.keys()].map(async (rg) =>
				this.processReleaseGroup(rg, releaseGroupRoots),
			);

			await Promise.all([...releaseGroupPromises, this.processIndependentPackages()]);
			return;
		}

		if (dir !== undefined) {
			return this.processPackages([dir], { kind: "packageDir" });
		}

		// Use dir="." as the default if neither a release group nor --packages was provided.
		if (releaseGroup === undefined && packages === false) {
			return this.processPackages(["."], { kind: "packageDir" });
		}

		if (releaseGroup !== undefined) {
			return this.processReleaseGroup(releaseGroup, releaseGroupRoots);
		}

		assert(packages);
		return this.processIndependentPackages();
	}
}

function scopesToPrefix(scopes: string[] | undefined): string[] | undefined {
	return scopes === undefined ? undefined : scopes.map((s) => `${s}/`);
}

function listNames(strings: string[]): string {
	return strings.length > 10 ? `${strings.length}` : `${strings.length} (${strings.join(", ")})`;
}
