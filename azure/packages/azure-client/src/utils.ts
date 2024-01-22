/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import type {
	AzureConnectionConfig,
	AzureLocalConnectionConfig,
	AzureRemoteConnectionConfig,
} from "./interfaces";

/**
 * Type guard for validating a given AzureConnectionConfig is a remote connection type (AzureRemoteConnectionConfig)
 */
export function isAzureRemoteConnectionConfig(
	connectionConfig: AzureConnectionConfig,
): connectionConfig is AzureRemoteConnectionConfig {
	return connectionConfig.type === "remote";
}

/**
 * Type guard for validating a given AzureConnectionConfig is a local connection type (AzureLocalConnectionConfig)
 */
export function isAzureLocalConnectionConfig(
	connectionConfig: AzureConnectionConfig,
): connectionConfig is AzureLocalConnectionConfig {
	return connectionConfig.type === "local";
}

/**
 * Wrapper {@link IConfigProviderBase} which allows for specifying feature gates if not present in the wrapped
 * provider.
 *
 * @param featureGates - the feature gates
 * @param wrapped - the original config provider
 * @returns The value for the requested feature gate from the original provider and if not present,
 * from the specified feature gates
 */
export const wrappedConfigProviderWithDefaults = (
	defaults: Record<string, ConfigTypes>,
	wrapped: IConfigProviderBase | undefined,
): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => wrapped?.getRawConfig(name) ?? defaults[name],
});
