/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay.
 *
 * @packageDocumentation
 */

export { RouterliciousClient } from "./RouterliciousClient.js";
export { RouterliciousFunctionTokenProvider } from "./RouterliciousFunctionTokenProvider.js";
export type {
	BaseClientProps,
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
} from "@fluidframework/base-client";

export type { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
export type { ITokenClaims, IUser } from "@fluidframework/protocol-definitions";
export { ScopeType } from "@fluidframework/protocol-definitions";

// Re-export so developers can build loggers without pulling in core-interfaces
export type { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
