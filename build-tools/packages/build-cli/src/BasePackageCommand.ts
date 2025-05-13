/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Package } from "@fluidframework/build-tools";
import { Command, Flags, ux } from "@oclif/core";
import async from "async";
import {
	PackageFilterOptions,
	PackageKind,
	PackageSelectionCriteria,
	PackageWithKind,
	parsePackageFilterFlags,
	parsePackageSelectionFlags,
	selectAndFilterPackages,
} from "./filter.js";
import { type PackageSelectionDefault, filterFlags, selectionFlags } from "./flags.js";
import { BaseCommand } from "./library/index.js";

/**
 * Commands that run operations per project.
 */
export abstract class PackageCommand<
	T extends typeof Command & { flags: typeof PackageCommand.flags },
> extends BaseCommand<T> {
	static readonly flags = {
		concurrency: Flags.integer({
			description: "The number of tasks to execute concurrently.",
			default: 25,
		}),
		...selectionFlags,
		...filterFlags,
		...BaseCommand.flags,
	};

	/**
	 * The default to use as selection criteria when none is explicitly provided by the user. This enables commands
	 * without flags to operate on a collection of packages by default that make sense based on the command.
	 */
	protected abstract get defaultSelection(): PackageSelectionDefault;
	protected abstract set defaultSelection(value: PackageSelectionDefault);

	protected filterOptions: PackageFilterOptions | undefined;
	protected selectionOptions: PackageSelectionCriteria | undefined;

	/**
	 * An array of packages selected based on the selection criteria.
	 *
	 * @remarks
	 *
	 * Note that these packages are not necessarily the ones that are acted on. Packages are selected, then that list is
	 * further narrowed by filtering criteria, so this array may contain packages that are not acted on.
	 */
	protected selectedPackages: PackageWithKind[] | undefined;

	/**
	 * The list of packages after all filters are applied to the selected packages.
	 */
	protected filteredPackages: PackageWithKind[] | undefined;

	/**
	 * Called for each package that is selected/filtered based on the filter flags passed in to the command.
	 *
	 * @param pkg - The package being processed.
	 * @param kind - The kind of the package.
	 * @typeparam TPkg - Type of the package-like object being processed.
	 */
	protected abstract processPackage<TPkg extends Package>(
		pkg: TPkg,
		kind: PackageKind,
	): Promise<void>;

	protected parseFlags(): void {
		this.selectionOptions = parsePackageSelectionFlags(this.flags, this.defaultSelection);
		this.filterOptions = parsePackageFilterFlags(this.flags);
	}

	protected async selectAndFilterPackages(): Promise<void> {
		if (this.selectionOptions === undefined) {
			throw new Error(`No packages selected.`);
		}

		const ctx = await this.getContext();
		const { selected, filtered } = await selectAndFilterPackages(
			ctx,
			this.selectionOptions,
			this.filterOptions,
		);

		[this.selectedPackages, this.filteredPackages] = [selected, filtered];
	}

	public async run(): Promise<unknown> {
		this.parseFlags();

		assert(this.selectionOptions !== undefined, "selectionOptions is undefined");
		assert(this.filterOptions !== undefined, "filterOptions is undefined");

		await this.selectAndFilterPackages();

		assert(this.selectedPackages !== undefined, "selectedPackages is undefined");
		assert(this.filteredPackages !== undefined, "filteredPackages is undefined");

		this.info(
			`Filtered ${this.selectedPackages.length} packages to ${listNames(
				this.filteredPackages.map((pkg) => pkg.directory),
			)}`,
		);

		const errors = await this.processPackages(this.filteredPackages);
		if (errors.length > 0) {
			this.errorLog(`Completed with ${errors.length} errors.`);
			for (const error of errors) {
				this.errorLog(error);
			}
			this.exit(1);
		}

		return undefined;
	}

	/**
	 * Runs the processPackage method on each package in the provided array.
	 *
	 * @returns An array of error strings. If the array is not empty, at least one of the calls to processPackage failed.
	 */
	protected async processPackages(packages: PackageWithKind[]): Promise<string[]> {
		let started = 0;
		let finished = 0;
		let succeeded = 0;
		const errors: string[] = [];

		// In verbose mode, we output a log line per package. In non-verbose mode, we want to display an activity
		// spinner, so we only start the spinner if verbose is false.
		const { verbose } = this.flags;

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
			await async.mapLimit(packages, this.flags.concurrency, async (pkg: PackageWithKind) => {
				started += 1;
				updateStatus();
				try {
					await this.processPackage(pkg, pkg.kind);
					succeeded += 1;
				} catch (error: unknown) {
					const errorString = `Error updating ${pkg.name}: '${error}'\nStack: ${
						(error as Error).stack
					}`;
					errors.push(errorString);
					this.verbose(errorString);
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
		return errors;
	}
}

function listNames(strings: string[] | undefined): string {
	return strings === undefined
		? ""
		: strings.length > 10
			? `${strings.length}`
			: `${strings.length} (${strings.join(", ")})`;
}
