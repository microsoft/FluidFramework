/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Types supported by {@link IConfigProviderBase}.
 * @internal
 */
export type ConfigTypes = string | number | boolean | number[] | string[] | boolean[] | undefined;

/**
 * Base interface for providing configurations to enable/disable/control features.
 * @internal
 */
export interface IConfigProviderBase {
	getRawConfig(name: string): ConfigTypes;
}
