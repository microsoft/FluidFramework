/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Package } from "@fluidframework/build-tools";
import { ux, Command, Flags } from "@oclif/core";
import async from "async";

import { BaseCommand } from "./base";
import {
	PackageDetails,
	PackageFilterOptions,
	PackageKind,
	PackageSelectionCriteria,
	parsePackageFilterFlags,
	parsePackageSelectionFlags,
	selectAndFilterPackages,
} from "./filter";
import { filterFlags, selectionFlags } from "./flags";

/**
 * Commands that run operations per project.
 */
export abstract class PackageCommand<
	T extends typeof Command & { flags: typeof PackageCommand.flags },
> extends BaseCommand<T> {
	static flags = {
		concurrency: Flags.integer({
			description: "The number of tasks to execute concurrently.",
			default: 25,
		}),
		...selectionFlags,
		...filterFlags,
		...BaseCommand.flags,
	};

	private filterOptions: PackageFilterOptions | undefined;
	private selectionOptions: PackageSelectionCriteria | undefined;

	/**
	 * Called for each package that is selected/filtered based on the filter flags passed in to the command.
	 *
	 * @param pkg - The package being processed.
	 * @param kind - The kind of the package.
	 */
	protected abstract processPackage(pkg: Package, kind: PackageKind): Promise<void>;

	public async run(): Promise<void> {
		this.selectionOptions = parsePackageSelectionFlags(this.flags);
		this.filterOptions = parsePackageFilterFlags(this.flags);

		if (this.selectionOptions === undefined) {
			throw new Error(`No packages selected.`);
		}

		const ctx = await this.getContext();
		const { selected, filtered } = selectAndFilterPackages(
			ctx,
			this.selectionOptions,
			this.filterOptions,
		);

		this.info(
			`Filtered ${selected.length} packages to ${listNames(
				filtered.map(({ package: pkg }) => pkg.directory),
			)}`,
		);

		return this.processPackages(filtered);
	}

	private async processPackages(packages: PackageDetails[]): Promise<void> {
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
			await async.mapLimit(
				packages,
				this.flags.concurrency,
				async (details: PackageDetails) => {
					started += 1;
					updateStatus();
					try {
						await this.processPackage(details.package, details.kind);
						succeeded += 1;
					} finally {
						finished += 1;
						updateStatus();
					}
				},
			);
		} finally {
			// Stop the spinner if needed.
			if (!verbose) {
				ux.action.stop(`Done. ${packages.length} Packages. ${finished - succeeded} Errors`);
			}
		}
	}
}

function listNames(strings: string[]): string {
	return strings.length > 10 ? `${strings.length}` : `${strings.length} (${strings.join(", ")})`;
}
