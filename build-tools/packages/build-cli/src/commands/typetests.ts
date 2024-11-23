/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, updatePackageJsonFile } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";

import { PackageCommand } from "../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../flags.js";
import {
	type ITypeValidationConfig,
	type PackageWithTypeTestSettings,
	defaultTypeValidationConfig,
	// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
	// eslint-disable-next-line import/no-internal-modules
} from "../typeValidator/typeValidatorConfig.js";

export default class PrepareTypeTestsCommand extends PackageCommand<
	typeof PrepareTypeTestsCommand
> {
	static readonly description =
		`Updates configuration for type tests in package.json files. If the previous version changes after running preparation, then npm install must be run before building.

    Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during configuration. This is useful when resetting the type tests to a clean state, such as after a release.

    To learn more about how to configure type tests, see the detailed documentation at <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.`;

	static readonly flags = {
		reset: Flags.boolean({
			description: "Resets the broken type test settings in package.json.",
		}),
		previous: Flags.boolean({
			char: "p",
			description: `Use the version immediately before the current version.

This is done by decrementing the least significant non-zero component (as separated by ".").

This means that "1.2.3" to "1.2.2" and "1.2.0" to "1.1.0".

This usually produces the version of the release that was made closest to the current version from a branch perspective.
For example if the version on main is "1.2.3",
the closest release history wise would be the first release of the previous minor, so "1.1.0" even if there were other point releases on the "1.1" branch.

If targeting prerelease versions, skipping versions, or using skipping some alternative numbering scheme use "--exact" to specify the desired version instead.
			`,
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
			description: `Remove the "typeValidation.disabled" setting in the package.json.`,
		}),
		disable: Flags.boolean({
			description: `Set the "typeValidation.disabled" setting to "true" in the package.json.`,
			exclusive: ["enable"],
		}),
		normalize: Flags.boolean({
			char: "n",
			description: `Removes any unrecognized data from "typeValidation" in the package.json and adds any missing default settings.`,
			exclusive: ["enable"],
		}),
		...PackageCommand.flags,
	};

	static readonly examples = [
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

	protected defaultSelection = "dir" as PackageSelectionDefault;

	protected async processPackage(pkg: Package): Promise<void> {
		const version =
			this.flags.exact ??
			(this.flags.remove
				? VersionOptions.Clear
				: this.flags.previous
					? VersionOptions.Previous
					: VersionOptions.ClearIfDisabled);
		updatePackageJsonFile(pkg.directory, (jsonIn) => {
			const json: PackageWithTypeTestSettings = jsonIn;
			if (this.flags.disable) {
				json.typeValidation ??= defaultTypeValidationConfig;
				json.typeValidation.disabled = true;
			} else if (this.flags.enable && json.typeValidation !== undefined) {
				delete json.typeValidation.disabled;
			}
			// This uses the "disabled" state, so that is set above before this is run.
			if (version !== undefined) {
				updateTypeTestDependency(json, version);
			}

			if (this.flags.reset) {
				resetBrokenTests(json);
			}

			if (this.flags.normalize) {
				json.typeValidation = {
					disabled:
						json.typeValidation?.disabled === true
							? true
							: defaultTypeValidationConfig.disabled,
					broken: json.typeValidation?.broken ?? defaultTypeValidationConfig.broken,
					entrypoint:
						json.typeValidation?.entrypoint ?? defaultTypeValidationConfig.entrypoint,
				};
			}
		});
	}
}

export enum VersionOptions {
	Clear,
	Previous,
	ClearIfDisabled,
}

/**
 * Gets the version before `version`.
 * This is done by decrementing the least significant non-zero component (as separated by `.`).
 *
 * @remarks
 * This means that `1.2.3` to `1.2.2` and `1.2.0` to `1.1.0`.
 *
 * When given the current version of a package (in the source),
 * this typically computes the version of the release that was made closest to the current version from a branch perspective.
 * For example if the version on main is `1.2.3`,
 * the closest release history wise would be the first release of the previous minor, so `1.1.0` even if there were other point releases on the `1.1` branch.
 */
export function previousVersion(version: string): string {
	const parts = version.split(".");
	for (let index = parts.length - 1; index >= 0; index--) {
		const element = parts[index];
		if (element !== "0") {
			const numeric = Number(element);
			if (String(numeric) !== element) {
				throw new Error(`Unable to lower non-numeric version "${element}" of "${version}"`);
			}
			parts[index] = String(numeric - 1);
			return parts.join(".");
		}
	}
	throw new Error(`Unable to lower version "${version}"`);
}

/**
 * Adds or removes the devDependency on a previous version of a package thatis used for type testing. This function only
 * affects the `devDependencies` nodes in package.json.
 *
 */
export function updateTypeTestDependency(
	pkgJson: PackageWithTypeTestSettings,
	versionOptions: string | VersionOptions,
): void {
	const oldDepName = `${pkgJson.name}-previous`;

	// Packages can explicitly opt out of type tests by setting typeValidation.disabled to true.
	const enabled = pkgJson.typeValidation?.disabled !== true;

	if (!enabled || versionOptions === VersionOptions.Clear) {
		// There isn't a type safe alternative to delete here,
		// and delete should be safe since the key can't collide with anything builtin since it has to end in `-previous`
		// which makes it not a valid identifier.
		if (pkgJson.devDependencies?.[oldDepName] !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete pkgJson.devDependencies[oldDepName];
		}
	} else if (versionOptions !== VersionOptions.ClearIfDisabled) {
		const newVersion: string =
			versionOptions === VersionOptions.Previous
				? previousVersion(pkgJson.version)
				: versionOptions;
		pkgJson.devDependencies ??= {};
		pkgJson.devDependencies[oldDepName] = `npm:${pkgJson.name}@${newVersion}`;
	}
}

/**
 * Removes any `typeValidation.broken` entries from package.json.
 */
export function resetBrokenTests(pkgJson: { typeValidation?: ITypeValidationConfig }): void {
	if (pkgJson.typeValidation !== undefined) {
		pkgJson.typeValidation.broken = {};
	}
}
