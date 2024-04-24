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
export { AzureFunctionTokenProvider } from "./AzureFunctionTokenProvider.js";
export type {
	AzureClientProps,
	AzureRemoteConnectionConfig,
	AzureLocalConnectionConfig,
	AzureConnectionConfig,
	AzureConnectionConfigType,
} from "./interfaces.js";
export type {
	IContainerServices,
	IContainerVersion,
	IGetVersionsOptions,
	BaseMember as AzureMember,
	BaseUser as AzureUser,
	IAudience,
} from "@fluidframework/base-client";

export type { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
export type { ITokenClaims, IUser } from "@fluidframework/protocol-definitions";
export { ScopeType } from "@fluidframework/protocol-definitions";

// Re-export so developers can build loggers without pulling in core-interfaces
export type { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
