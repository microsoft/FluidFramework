/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Types supported by {@link IConfigProviderBase}.
 * @public
 */
export type ConfigTypes = string | number | boolean | number[] | string[] | boolean[] | undefined;

/**
 * Base interface for providing configurations to enable/disable/control features.
 * @public
 */
export interface IConfigProviderBase {
	/**
	 * For the specified config name this function gets the value.
	 *
	 * This type is meant be easy to implement by Fluid Framework consumers
	 * so the returned valued needs minimal type coercion, and allows consumers to
	 * return values in a natural way from whatever source they retrieve them.
	 *
	 * For instance a value of 1 maybe be returned as a string or a number.
	 * For array types a json string or an object are allowable.
	 *
	 * It should return undefined if there is no value available for the config name.
	 *
	 * @param name - The name of the config to get the value for.
	 *
	 * @privateRemarks Generally, this type should only be taken as input, and be wrapped by an
	 * internal monitoring context from the fluidframework/telemetry-utils package. That will provide
	 * a wrapper with provides strongly typed access to values via consistent type coercion.
	 */
	getRawConfig(name: string): ConfigTypes;
}
