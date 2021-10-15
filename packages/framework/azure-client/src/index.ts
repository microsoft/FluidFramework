/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay.
 *
 * @packageDocumentation
 */

export * from "./AzureAudience";
export * from "./AzureClient";
export * from "./AzureFunctionTokenProvider";
export * from "./interfaces";

export { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
export { ScopeType, ITokenClaims, IUser } from "@fluidframework/protocol-definitions";
