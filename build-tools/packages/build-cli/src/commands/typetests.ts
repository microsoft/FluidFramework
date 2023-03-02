/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";

import {
	updatePackageJsonFile,
	updateTypeTestConfiguration,
	VersionOptions,
} from "@fluidframework/build-tools";

import { PackageCommand } from "../BasePackageCommand";

export default class PrepareTypeTestsCommand extends PackageCommand<
	typeof PrepareTypeTestsCommand
> {
	static description = `Updates configuration for type tests in package.json files. If the previous version changes after running preparation, then npm install must be run before building.

    Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during configuration. This is useful when resetting the type tests to a clean state, such as after a release.

    To learn more about how to configure type tests, see the detailed documentation at <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.`;

	static flags = {
		reset: Flags.boolean({
			description: "Resets the broken type test settings in package.json.",
		}),
		previous: Flags.boolean({
			char: "p",
			description: `Use the version immediately before the current version.`,
			exclusive: ["exact", "remove", "disable"],
		}),
		remove: Flags.boolean({
			char: "r",
			description: `Remove the test "-previous" version dependency. This is also done implicitly (without this flag) if type tests are disabled.`,
			exclusive: ["exact", "previous"],
		}),
		exact: Flags.string({
			description:
				"An exact string to use as the previous version constraint. The string will be used as-is.",
			exclusive: ["remove", "previous", "disable"],
		}),
		enable: Flags.boolean({
			description: `Remove the "typeValidation.disabled" setting in the package.json`,
		}),
		disable: Flags.boolean({
			description: `Set the "typeValidation.disabled" setting to "true" in the package.json`,
			exclusive: ["enable"],
		}),
		normalize: Flags.boolean({
			char: "n",
			description: `Removes any unrecognized data from "typeValidation" in the package.json`,
			exclusive: ["enable"],
		}),
		...PackageCommand.flags,
	};

	static examples = [
		{
			description:
				"Update type test configuration in package.json for all packages in the client. This is what would be run for client minor releases on both the release branch and the main branch after the version bump and publishing of the first point release of that minor.",
			command: "<%= config.bin %> <%= command.id %> -g client --reset --previous",
		},
		{
			description:
				"Disable type tests and cleanup anything left related to them in the package.json other than the disable flag.",
			command: "<%= config.bin %> <%= command.id %> --reset --normalize --disable",
		},
	];

	protected async processPackage(directory: string): Promise<void> {
		const version =
			this.flags.exact ??
			(this.flags.remove
				? VersionOptions.Clear
				: this.flags.previous
				? VersionOptions.Previous
				: VersionOptions.ClearIfDisabled);
		updatePackageJsonFile(directory, (json) => {
			if (this.flags.disable) {
				json.typeValidation ??= { broken: {} };
				json.typeValidation.disabled = true;
			} else if (this.flags.enable && json.typeValidation !== undefined) {
				delete json.typeValidation.disabled;
			}
			// This uses the "disabled" state, so that is set above before this is run.
			updateTypeTestConfiguration(json, { resetBroken: this.flags.reset, version });
			if (this.flags.normalize) {
				json.typeValidation = {
					disabled: json.typeValidation?.disabled === true ? true : undefined,
					broken: json.typeValidation?.broken ?? {},
				};
			}
		});
	}
}
