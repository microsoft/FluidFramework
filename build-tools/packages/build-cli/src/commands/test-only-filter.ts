/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Package } from "@fluidframework/build-tools";
import { PackageCommand } from "../BasePackageCommand.js";
import { PackageWithKind } from "../filter.js";
import type { PackageSelectionDefault } from "../flags.js";

interface FilterCommandResult {
	selected: Pick<Package, "name" | "directory">[];
	filtered: Pick<Package, "name" | "directory">[];
}

/**
 * This command is used to test the common package filtering and selection logic that is used across the CLI. It
 * subclasses PackageCommand and outputs JSON containing metadata about the packages selected and filtered. This output
 * is parsed in tests.
 *
 * It may not be obvious why these command-level tests are needed in addition to testing the functions that do most of
 * the filtering (see ../filter.test.ts). The reason is that the code to translate oclif's flags into selection/filter
 * objects lives in the PackageCommand command. There's no way (that I know of) to mock an oclif command's flags.
 *
 * Instead, this test command is a real command, and the tests call it using the oclif command test infrastructure. This
 * ensures that we are testing the complete pipeline from command flag parsing, to creating selection/filter objects
 * from the flags, through applying to those filters to the packages in the repo.
 *
 * While the --json flag is technically optional, it should always be passed when using this command for testing.
 * Otherwise there is no output to be checked for correctness.
 */
export default class FilterCommand extends PackageCommand<typeof FilterCommand> {
	static readonly summary =
		`FOR INTERNAL TESTING ONLY. This command is used only to test the common package filtering and selection logic that is used across the CLI. FOR INTERNAL TESTING ONLY.`;

	static readonly description =
		`This command outputs JSON containing metadata about the packages selected and filtered. This output is parsed in tests. While the --json flag is technically optional, it should always be passed when using this command for testing. Otherwise there is no output to be checked for correctness.`;

	// hide the command from help since it's only supposed to be used for internal testing
	static readonly hidden = true;

	static readonly enableJsonFlag = true;
	protected defaultSelection = "dir" as PackageSelectionDefault;

	protected async processPackage(_pkg: Package): Promise<void> {
		// do nothing
	}

	protected async processPackages(_packages: PackageWithKind[]): Promise<string[]> {
		// do nothing
		return [];
	}

	public async run(): Promise<FilterCommandResult> {
		await super.run();

		assert(this.selectionOptions !== undefined, "selectionOptions is undefined");
		assert(this.filterOptions !== undefined, "filterOptions is undefined");
		assert(this.selectedPackages !== undefined, "selectedPackages is undefined");
		assert(this.filteredPackages !== undefined, "filteredPackages is undefined");

		const context = await this.getContext();
		const pkgs = {
			selected: this.selectedPackages.map((p) => {
				return {
					name: p.name,
					directory: context.repo.relativeToRepo(p.directory),
				};
			}),
			filtered: this.filteredPackages.map((p) => {
				return {
					name: p.name,
					directory: context.repo.relativeToRepo(p.directory),
				};
			}),
		};

		return pkgs;
	}
}
