/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @packageDocumentation
 * @beta
 * {@label Azure}
 *
 * A simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay.
 *
 * @remarks
 * This package provides functionalities to connect, retrieve, and manage Fluid data using Azure Fluid Relay.
 *
 * @example
 * ```typescript
 * import { AzureClient } from '@azure-fluid/framework';
 * ```
 *
 * @see {@link AzureClient} for main entry point to the package
 * @public
 */
export { AzureAudience } from "./AzureAudience";

/**
 * The primary class for interacting with Azure Fluid Relay.
 *
 * {@label Azure}
 * @remarks
 * Provides methods for creating and retrieving Fluid containers.
 * @public
 */
export { AzureClient } from "./AzureClient";

/**
 * Token provider using Azure Functions.
 *
 * {@label Azure}
 * @public
 */
export { AzureFunctionTokenProvider } from "./AzureFunctionTokenProvider";

/**
 * Describes the properties required for initializing an AzureClient instance.
 *
 * {@label Azure}
 * @typeParam T - The container data model type
 * @public
 */
export {
	AzureClientProps,
	AzureConnectionConfig,
	AzureConnectionConfigType,
	AzureContainerServices,
	AzureContainerVersion,
	AzureGetVersionsOptions,
	AzureLocalConnectionConfig,
	AzureMember,
	AzureRemoteConnectionConfig,
	AzureUser,
	IAzureAudience,
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	testTSDocBellsAndWhistles,
} from "./interfaces";

/**
 * Interface for the token provider.
 * {@label External Dependencies}
 * @public
 */
export { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";

/**
 * Describes user and token related definitions.
 * {@label External Dependencies}
 * @public
 */
export { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
