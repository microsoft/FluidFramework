/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidContainer, IMember, IServiceAudience } from "@fluid-experimental/fluid-framework";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

export interface TinyliciousContainerConfig {
    id: string;
    logger?: ITelemetryBaseLogger;
}

export interface TinyliciousConnectionConfig {
    port?: number;
    domain?: string
}

/**
 * TinyliciousContainerServices is returned by the TinyliciousClient alongside a FluidContainer.
 * It holds the functionality specifically tied to the Tinylicious service, and how the data stored in
 * the FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to use,
 * will not be included here but rather on the FluidContainer class itself.
 */
export interface TinyliciousContainerServices {
    /**
     * Provides an object that can be used to get the users that are present in this Fluid session and
     * listeners for when the roster has any changes from users joining/leaving the session
     */
    audience: ITinyliciousAudience;
}

export interface TinyliciousResources {
    fluidContainer: FluidContainer;
    containerServices: TinyliciousContainerServices;
}

/**
 * Since Tinylicious provides user names for all of its members, we extend the IMember interface to include
 * this service-specific value. It will be returned for all audience members connected to Tinylicious.
 */
export interface TinyliciousMember extends IMember {
    userName: string;
}

export type ITinyliciousAudience = IServiceAudience<TinyliciousMember>;
