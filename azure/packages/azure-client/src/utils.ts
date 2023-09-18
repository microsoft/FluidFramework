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

/**
 * Test API with comprehensive TSDoc documentation.
 *
 * @remarks
 * This API is designed to showcase all possible features of TSDoc and API Extractor.
 *
 * @defaultValue 'N/A'
 * @decorator TEST
 * @deprecated Use another API instead.
 * @eventProperty
 * @example
 * ```typescript
 * const result = testTSDocBellsAndWhistles<string>();
 * ```
 * @example
 * ```javascript
 * const result = testTSDocBellsAndWhistles();
 * ```
 *
 * @see {@link https://example.com | Example URL}
 * @override
 * @packageDocumentation
 * @param param1 - Description of the first parameter.
 * @privateRemarks
 * This is private and should not appear in public documentation.
 * @readonly
 * @returns Does not return anything.
 * @sealed
 * @see {@link https://example.com | Another Example URL}
 * @throws Throws an error if something goes wrong.
 * @typeParam T - A generic type parameter.
 * @experimental
 * @virtual
 *
 * Release Tags choose one
 * @alpha
 * \@beta
 * \@internal
 * \@public
 */
export function testTSDocBellsAndWhistles<T>(param1: string): void {
	// Function implementation here.
}
