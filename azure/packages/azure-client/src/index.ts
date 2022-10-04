/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay.
 *
 * @packageDocumentation
 */

export { AzureAudience } from "./AzureAudience";
export { AzureClient } from "./AzureClient";
export { AzureFunctionTokenProvider } from "./AzureFunctionTokenProvider";
export {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    AzureClientProps,
    AzureContainerVersion,
    AzureGetVersionsOptions,
    AzureConnectionConfigType,
    AzureConnectionConfig,
    AzureRemoteConnectionConfig,
    AzureLocalConnectionConfig,
    AzureContainerServices,
    AzureUser,
    AzureMember,
    IAzureAudience,
} from "./interfaces";

export { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
export { ScopeType, ITokenClaims, IUser } from "@fluidframework/protocol-definitions";
