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

/**
 * Configuration for type validation in Fluid packages.
 *
 * @remarks Configured via the `typeValidation` property in the package.json.
 *
 * @defaultValue {@link defaultTypeValidationConfig}
 */
export interface ITypeValidationConfig {
	/**
	 * The entrypoint (API level) for which type tests should be generated.
	 *
	 * @defaultValue {@link defaultTypeValidationConfig.entryPoint}
	 */
	entrypoint?: ApiLevel;

	/**
	 * An optional record of types that are known to be broken.
	 *
	 * @defaultValue {@link defaultTypeValidationConfig.broken}.
	 */
	broken?: BrokenCompatTypes;

	/**
	 * If true, disables type test preparation and generation for the package.
	 *
	 * @defaultValue {@link defaultTypeValidationConfig.disabled}.
	 */
	disabled?: boolean;
}

/**
 * {@link ITypeValidationConfig} defaults.
 */
export const defaultTypeValidationConfig = {
	entrypoint: ApiLevel.legacyAlpha,
	broken: {},
	disabled: false,
} as const satisfies Required<ITypeValidationConfig>;

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
