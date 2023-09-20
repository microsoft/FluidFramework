/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	AzureConnectionConfig,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
} from "./interfaces";

/**
 * Type guard for validating a given AzureConnectionConfig is a remote connection type (AzureRemoteConnectionConfig)
 *
 * @public
 * @remarks
 * Use this function to confirm if a `AzureConnectionConfig` object can be treated as `AzureRemoteConnectionConfig`.
 * @param connectionConfig - The configuration object to check.
 * @returns True if the given config is an AzureRemoteConnectionConfig, otherwise false.
 * @example
 * ```typescript
 * const config: AzureConnectionConfig = { type: 'remote', ... };
 * if (isAzureRemoteConnectionConfig(config)) {
 *     console.log('This is a remote connection config.');
 * }
 * ```
 * @see {@link AzureConnectionConfig}
 * @see {@link AzureRemoteConnectionConfig}
 */
export function isAzureRemoteConnectionConfig(
	connectionConfig: AzureConnectionConfig,
): connectionConfig is AzureRemoteConnectionConfig {
	return connectionConfig.type === "remote";
}

/**
 * Type guard for validating a given AzureConnectionConfig is a local connection type (AzureLocalConnectionConfig)
 *
 * @public
 * @remarks
 * Use this function to confirm if a `AzureConnectionConfig` is a local connection type.
 * @param connectionConfig - The configuration object to check.
 * @returns True if the given config is an local connection, otherwise false.
 * @example
 * ```typescript
 * const config: AzureConnectionConfig = { type: 'local', ... };
 * if (isAzureLocalConnectionConfig(config)) {
 *     console.log('This is a local connection config.');
 * }
 * ```
 * @see {@link AzureConnectionConfig}
 * @see {@link AzureLocalConnectionConfig}
 */
export function isAzureLocalConnectionConfig(
	connectionConfig: AzureConnectionConfig,
): connectionConfig is AzureLocalConnectionConfig {
	return connectionConfig.type === "local";
}
