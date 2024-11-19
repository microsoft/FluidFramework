/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PackageJson } from "@fluidframework/build-tools";

/**
 * Metadata about known-broken types.
 */
export interface BrokenCompatSettings {
	backCompat?: false;
	forwardCompat?: false;
}

/**
 * A mapping of a type name to its {@link BrokenCompatSettings}.
 */
export type BrokenCompatTypes = Partial<Record<string, BrokenCompatSettings>>;

// Duplicate of the ApiLevel type defined in build-cli/src/library/apiLevel.ts
// AB#12469 tracks moving the type test infra into build-cli, at which point this duplicate type won't be needed.
export type ApiLevel = "public" | "beta" | "alpha" | "internal" | "legacy";

export interface ITypeValidationConfig {
	/**
	 * The entrypoint (API level) for which type tests should be generated. This value can be overridden when using
	 * `flub generate typetests` by passing the `--entrypoint` flag. If this value is not provided, it will default to
	 * {@link ApiLevel.legacy}.
	 *
	 * @defaultValue {@link ApiLevel.legacy}
	 */
	entrypoint: ApiLevel;

	/**
	 * An object containing types that are known to be broken.
	 */
	broken: BrokenCompatTypes;

	/**
	 * If true, disables type test preparation and generation for the package.
	 *
	 * @defaultValue `false`
	 */
	disabled?: boolean;
}

export const defaultTypeValidationConfig: ITypeValidationConfig = {
	entrypoint: "legacy",
	broken: {},
	disabled: undefined,
};

/**
 * A type representing package.json files with the Fluid-specific `typeValidation` settings.
 *
 * @remarks
 *
 * This type is needed because the config types (ITypeValidationConfig) live in build-cli, but the Package definitions
 * are all in build-tools. Ultimately the Package class and supporting classes/types should move to a common package
 * that is consumed by both fluid-build and build-cli.
 */
export type PackageWithTypeTestSettings = PackageJson & {
	typeValidation?: ITypeValidationConfig;
};
