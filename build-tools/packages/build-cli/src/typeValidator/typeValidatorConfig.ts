/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PackageJson } from "@fluidframework/build-tools";
import { ApiLevel } from "../library/index.js";

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

export interface ITypeValidationConfig {
	/**
	 * The entrypoint (API level) for which type tests should be generated. This value can be overridden when using
	 * `flub generate typetests` by passing the `--entrypoint` flag. If this value is not provided, it will default to
	 * {@link ApiLevel.legacyAlpha}.
	 *
	 * @defaultValue {@link ApiLevel.legacyAlpha}
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

/**
 * {@link ITypeValidationConfig} with default values.
 */
export const defaultTypeValidationConfig: ITypeValidationConfig = {
	entrypoint: ApiLevel.legacyAlpha,
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
