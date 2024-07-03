/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay.
 *
 * @packageDocumentation
 */

export { AzureClient } from "./AzureClient.js";
export type {
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
} from "./interfaces.js";

export type { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
export type { IUser } from "@fluidframework/driver-definitions";
export { type ITokenClaims, ScopeType } from "@fluidframework/driver-definitions/internal";

// Re-export so developers can build loggers without pulling in core-interfaces
export type {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";

// Re-export so developers have access to parameter types for createContainer/getContainer without pulling in fluid-static
export type { CompatibilityMode } from "@fluidframework/fluid-static";
