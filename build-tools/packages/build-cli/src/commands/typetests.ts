/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { realpathSync } from "node:fs";
import { updatePackageJsonFile } from "@fluid-tools/build-infrastructure";
import type { Package } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { PackageCommand, type PackageProcessingError } from "../BasePackageCommand.js";
import type { PackageWithKind } from "../filter.js";
import type { PackageSelectionDefault } from "../flags.js";
import { PnpmCatalogEditor } from "../library/pnpmCatalog.js";
import {
	defaultTypeValidationConfig,
	type ITypeValidationConfig,
	type PackageWithTypeTestSettings,
} from "../typeValidator/typeValidatorConfig.js";

const previousCatalogName = "typeTest-previous";

/**
 * Prepares type-test settings and baseline dependencies for the selected packages.
 */
export default class PrepareTypeTestsCommand extends PackageCommand<
	typeof PrepareTypeTestsCommand
> {
	static readonly description =
		`Updates configuration for type tests in package.json files and pnpm catalogs. If the previous version changes after running preparation, then install dependencies before building.

    In pnpm workspaces, baseline versions are stored in the named "typeTest-previous" catalog by default. Use --no-catalog to write inline npm aliases instead.

    Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during configuration. This is useful when resetting the type tests to a clean state, such as after a release.

    To learn more about how to configure type tests, see the detailed documentation at <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.`;

	static readonly flags = {
		catalog: Flags.boolean({
			description:
				"Store previous-version dependencies in the typeTest-previous pnpm catalog. Non-pnpm packages use inline npm aliases.",
			default: true,
			allowNo: true,
		}),
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
			description: `Normalizes type test configuration in package.json. Removes unrecognized data from "typeValidation" and adds any missing default settings. Also updates the "typetests:gen" script: adds or replaces it when type tests are enabled, or removes it when disabled.`,
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

	private readonly packageCatalogs = new Map<string, PnpmCatalogEditor>();

	protected async processPackages(
		packages: PackageWithKind[],
	): Promise<PackageProcessingError[]> {
		const workspaceCatalogs = new Map<string, PnpmCatalogEditor>();
		this.packageCatalogs.clear();
		if (this.flags.catalog && (this.flags.previous || this.flags.exact !== undefined)) {
			const context = await this.getContext();
			for (const pkg of packages) {
				// Directory selection loads packages without their monorepo metadata.
				const configuredPackage = context.fullPackageMap.get(pkg.name);
				const workspacePackage =
					configuredPackage !== undefined &&
					realpathSync.native(configuredPackage.directory) ===
						realpathSync.native(pkg.directory)
						? configuredPackage
						: pkg;
				if (workspacePackage.packageManager !== "pnpm") {
					continue;
				}
				const workspaceRoot =
					workspacePackage.monoRepo?.repoPath ?? workspacePackage.directory;
				let catalog = workspaceCatalogs.get(workspaceRoot);
				if (catalog === undefined) {
					catalog = new PnpmCatalogEditor(workspaceRoot, previousCatalogName);
					workspaceCatalogs.set(workspaceRoot, catalog);
				}
				this.packageCatalogs.set(pkg.directory, catalog);
			}
		}

		const errors = await super.processPackages(packages);
		for (const catalog of workspaceCatalogs.values()) {
			catalog.save();
		}
		return errors;
	}

	protected async processPackage(pkg: Package): Promise<void> {
		const catalog = this.packageCatalogs.get(pkg.directory);
		const catalogUpdates = catalog === undefined ? undefined : new Map<string, string>();
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
				updateTypeTestDependency(json, version, catalogUpdates);
			}

			if (this.flags.reset) {
				resetBrokenTests(json);
			}

			if (this.flags.normalize) {
				json.typeValidation = normalizeConfig(json.typeValidation);
				normalizeTypeTestScript(json);
			}
		});
		for (const [name, alias] of catalogUpdates ?? []) {
			catalog?.updates.set(name, alias);
		}
	}
}

/**
 * Generates a simplified version of the input config.
 * @remarks Omits some defaults, and removes other properties when the config is `disabled`.
 */
export function normalizeConfig(
	config: Readonly<ITypeValidationConfig> | undefined,
): ITypeValidationConfig {
	if (config?.disabled === true) {
		// If disabled, remove other properties (which will not be used).
		return {
			disabled: true,
		};
	}

	const normalized: ITypeValidationConfig = {
		...config,
	};

	// Omit `disabled` when false (this is the default).
	delete normalized.disabled;

	// Omit entrypoint if it is the default.
	if (normalized.entrypoint === defaultTypeValidationConfig.entrypoint) {
		delete normalized.entrypoint;
	}

	// Populate empty `broken` property if it is not set.
	// This helps make the property more discoverable and easier to edit as needed.
	if (normalized.broken === undefined) {
		normalized.broken = { ...defaultTypeValidationConfig.broken };
	}
	return normalized;
}

const typetestsGenScript = "flub generate typetests --dir . -v";

/**
 * Normalizes the `typetests:gen` script in the package.json `scripts` section when the
 * `typeValidation` node is present.
 *
 * If `typeValidation.disabled` is `true`, the script is removed. Otherwise, if `typeValidation`
 * is defined, the script is added or replaced. If `typeValidation` is `undefined`, this function
 * does not modify `scripts`.
 */
export function normalizeTypeTestScript(pkgJson: PackageWithTypeTestSettings): void {
	if (pkgJson.typeValidation?.disabled === true) {
		if (pkgJson.scripts?.["typetests:gen"] !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete pkgJson.scripts["typetests:gen"];
		}
	} else if (pkgJson.typeValidation !== undefined) {
		pkgJson.scripts ??= {};
		pkgJson.scripts["typetests:gen"] = typetestsGenScript;
	}
}

/**
 * Operations on the previous-version dependency used by type tests.
 */
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
 * Adds or removes the devDependency on a previous version of a package used for type testing.
 *
 * @param pkgJson - The package.json to update.
 * @param versionOptions - The baseline constraint or dependency operation.
 * @param catalogUpdates - If provided, collects aliases for the typeTest-previous catalog instead of writing inline aliases.
 * Removing a dependency leaves catalog entries intact because other packages can reference them.
 *
 */
export function updateTypeTestDependency(
	pkgJson: PackageWithTypeTestSettings,
	versionOptions: string | VersionOptions,
	catalogUpdates?: Map<string, string>,
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
		const alias = `npm:${pkgJson.name}@${newVersion}`;
		if (catalogUpdates === undefined) {
			pkgJson.devDependencies[oldDepName] = alias;
		} else {
			catalogUpdates.set(oldDepName, alias);
			pkgJson.devDependencies[oldDepName] = `catalog:${previousCatalogName}`;
		}
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
