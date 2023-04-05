/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Context, PackageJson } from "@fluidframework/build-tools";
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
export type PackageKind =
	/**
	 * Package is an independent package.
	 */
	| "independentPackage"

	/**
	 * Package is part of a release group, but is _not_ the root.
	 */
	| "releaseGroupChildPackage"

	/**
	 * Package is the root package of a release group.
	 */
	| "releaseGroupRootPackage"

	/**
	 * Package is being loaded from a directory. The package may be one of the other three kinds. This kind is only used
	 * when running on a package diurectly using its directory.
	 */
	| "packageFromDirectory";

/**
 * A convenience type mapping a directory containing a package to its PackageKind.
 */
interface PackageDetails {
	directory: string;
	kind: PackageKind;
}
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

	protected abstract processPackage(directory: string, kind: PackageKind): Promise<void>;

	private async processPackageFromDetails(packageDetails: PackageDetails) {
		return this.processPackage(packageDetails.directory, packageDetails.kind);
	}

	private async processPackages(packageDetails: PackageDetails[]): Promise<void> {
		const scopeIn = scopesToPrefix(this.flags.scope);
		const scopeOut = scopesToPrefix(this.flags.skipScope);
		const directories = packageDetails.map((pd) => pd.directory);

		const packages = this.filterScopes(packageDetails, scopeIn, scopeOut);
		let started = 0;
		let finished = 0;
		let succeeded = 0;
		// In verbose mode, we output a log line per package. In non-verbose mode, we want to display an activity
		// spinner, so we only start the spinner if verbose is false.
		const verbose = this.flags.verbose;

		if (verbose) {
			this.info(
				`Filtered ${listNames(directories)} packages to ${listNames(
					packages.map((p) => p.directory),
				)}`,
			);
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
			await async.mapLimit(packages, 25, async (details: PackageDetails) => {
				started += 1;
				updateStatus();
				try {
					await this.processPackageFromDetails(details);
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
	 * Returns an array of the release group packages that should be processed.
	 */
	private getReleaseGroupPackages(
		ctx: Context,
		releaseGroup: ReleaseGroup,
		rootPackageOnly: boolean,
	): PackageDetails[] {
		this.info(`Finding packages for release group: ${releaseGroup}`);
		if (rootPackageOnly) {
			const rg = ctx.repo.releaseGroups.get(releaseGroup);
			assert(rg !== undefined);
			return [{ directory: rg.repoPath, kind: "releaseGroupRootPackage" }];
		}

		return ctx.packagesInReleaseGroup(releaseGroup).map((p) => {
			return { directory: p.directory, kind: "releaseGroupChildPackage" };
		});
	}

	/**
	 * Returns an array of the independent packages that should be processed.
	 */
	private getIndependentPackages(ctx: Context): PackageDetails[] {
		this.info(`Finding independent packages`);
		return ctx.independentPackages.map((p) => {
			return { directory: p.directory, kind: "independentPackage" };
		});
	}

	/**
	 * Filters packages out of an array based on the scope settings.
	 */
	private filterScopes(
		input: PackageDetails[],
		scopeIn?: string[],
		scopeOut?: string[],
	): PackageDetails[] {
		return input.filter((details) => {
			const { directory } = details;
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
	}

	public async run(): Promise<void> {
		const flags = this.flags;

		const { all, dir, releaseGroup, releaseGroupRoots, packages } = flags;

		const ctx = await this.getContext();
		const packagesToRunOn: PackageDetails[] = [];

		// Add independent packages
		if (packages || all) {
			packagesToRunOn.push(...this.getIndependentPackages(ctx));
		}

		// Add release group packages
		if (releaseGroup !== undefined) {
			packagesToRunOn.push(
				...this.getReleaseGroupPackages(ctx, releaseGroup, releaseGroupRoots),
			);
		} else if (all) {
			// for each release group, run on its root or all its packages based on the releaseGroupRoots
			for (const rg of ctx.repo.releaseGroups.keys()) {
				packagesToRunOn.push(...this.getReleaseGroupPackages(ctx, rg, releaseGroupRoots));
			}
		}

		// Add package by directory
		if (dir !== undefined) {
			packagesToRunOn.push({ directory: dir, kind: "packageFromDirectory" });
		}

		// Use dir="." as the default if neither a release group nor --packages was provided.
		if (releaseGroup === undefined && packages === false) {
			packagesToRunOn.push({ directory: ".", kind: "packageFromDirectory" });
		}

		return this.processPackages(packagesToRunOn);
	}
}

function scopesToPrefix(scopes: string[] | undefined): string[] | undefined {
	return scopes === undefined ? undefined : scopes.map((s) => `${s}/`);
}

function listNames(strings: string[]): string {
	return strings.length > 10 ? `${strings.length}` : `${strings.length} (${strings.join(", ")})`;
}
