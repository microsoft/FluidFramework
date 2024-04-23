/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AzureConnectionConfig,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
} from "./interfaces.js";

/**
 * Type guard for validating a given AzureConnectionConfig is a remote connection type (AzureRemoteConnectionConfig)
 * @public
 */
export function isAzureRemoteConnectionConfig(
	connectionConfig: AzureConnectionConfig,
): connectionConfig is AzureRemoteConnectionConfig {
	return connectionConfig.type === "remote";
}

/**
 * Type guard for validating a given AzureConnectionConfig is a local connection type (AzureLocalConnectionConfig)
 * @public
 */
export function isAzureLocalConnectionConfig(
	connectionConfig: AzureConnectionConfig,
): connectionConfig is AzureLocalConnectionConfig {
	return connectionConfig.type === "local";
}
