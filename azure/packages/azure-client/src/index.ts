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
} from "./interfaces";

export { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
export { ITokenClaims, IUser, ScopeType } from "@fluidframework/protocol-definitions";
