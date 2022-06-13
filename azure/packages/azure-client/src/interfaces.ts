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
 * Container version metadata.
 */
export interface AzureContainerVersion {
    /**
     * Version ID
     */
    id: string;

    /**
     * Time when version was generated.
     * ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
     */
    date?: string;
}

/**
 * Options for "Get Container Versions" API.
 */
export interface AzureGetVersionsOptions {
    /**
     * Max number of versions
     */
    maxCount: number;
}

/**
 * The type of connection.
 * - "local" for local connections to a Fluid relay instance running on the localhost
 * - "remote" for client connections to the Azure Fluid Relay service
 */
export type AzureConnectionConfigType = "local" | "remote";

/**
 * Parameters for establishing a connection with the Azure Fluid Relay.
 */
export interface AzureConnectionConfig {
    /**
     * The type of connection. Whether we're connecting to a remote Fluid relay server or a local instance.
     */
    type: AzureConnectionConfigType;
    /**
     * URI to the Azure Fluid Relay service discovery endpoint.
     */
    endpoint: string;
    /**
     * Instance that provides Azure Fluid Relay endpoint tokens.
     */
    tokenProvider: ITokenProvider;
}

/**
 * Parameters for establishing a remote connection with the Azure Fluid Relay.
 */
export interface AzureRemoteConnectionConfig extends AzureConnectionConfig {
    /**
     * The type of connection. Set to a remote connection.
     */
    type: "remote";
    /**
     * Unique tenant identifier.
     */
    tenantId: string;
}

/**
 * Parameters for establishing a local connection with a local instance of the Azure Fluid Relay.
 */
export interface AzureLocalConnectionConfig extends AzureConnectionConfig {
    /**
     * The type of connection. Set to a remote connection.
     */
    type: "local";
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
