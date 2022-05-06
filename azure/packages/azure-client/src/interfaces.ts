/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
    IMember,
    IServiceAudience,
} from "@fluidframework/fluid-static";
import { ITokenProvider } from "@fluidframework/routerlicious-driver";

// Re-export so developers can build loggers without pulling in common-definitions
export {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
} from "@fluidframework/common-definitions";

/**
 * Props for initializing a new AzureClient instance
 */
export interface AzureClientProps {
    /**
     * Configuration for establishing a connection with the Azure Fluid Relay.
     */
    readonly connection: AzureConnectionConfig;
    /**
     * Optional. A logger instance to receive diagnostic messages.
     */
    readonly logger?: ITelemetryBaseLogger;
}

/**
 * Parameters for establishing a connection with the Azure Fluid Relay.
 */
export interface AzureConnectionConfig {
    /**
     * URI to the Azure Fluid Relay orderer endpoint
     */
    orderer: string;
    /**
     * URI to the Azure Fluid Relay storage endpoint
     */
    storage: string;
    /**
     * Unique tenant identifier
    */
    tenantId: "local" | string;
    /**
     * Instance that provides Azure Fluid Relay endpoint tokens
     */
    tokenProvider: ITokenProvider;
}

/**
 * AzureContainerServices is returned by the AzureClient alongside a FluidContainer.
 * It holds the functionality specifically tied to the Azure Fluid Relay, and how the data stored in
 * the FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to use,
 * will not be included here but rather on the FluidContainer class itself.
 */
export interface AzureContainerServices {
    /**
     * Provides an object that can be used to get the users that are present in this Fluid session and
     * listeners for when the roster has any changes from users joining/leaving the session
     */
    audience: IAzureAudience;
}

/**
 * Since Azure provides user names for all of its members, we extend the IMember interface to include
 * this service-specific value. It will be returned for all audience members connected to Azure.
 */
export interface AzureMember<T = any> extends IMember {
    userName: string;
    additionalDetails?: T;
}

/**
 * Audience object for Azure Fluid Relay containers
 */
export type IAzureAudience = IServiceAudience<AzureMember>;
