/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { IUser } from "@fluidframework/protocol-definitions";

// Re-export so developers can build loggers without pulling in common-definitions
export {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
} from "@fluidframework/common-definitions";

/**
 * Props for initializing a {@link TinyliciousClient}
 */
export interface TinyliciousClientProps {
    /**
     * Optional. Configuration for establishing a connection with the Tinylicious.
     * If not specified, will use {@link TinyliciousConnectionConfig}'s default values.
     */
    connection?: TinyliciousConnectionConfig;
    /**
     * Optional. A logger instance to receive diagnostic messages.
     */
    logger?: ITelemetryBaseLogger;
}

/**
 * Parameters for establishing a connection with the a Tinylicious service.
 */
export interface TinyliciousConnectionConfig {
    /**
     * Optional. Override of the port
     * @defaultValue - {@link @fluidframework/tinylicious-driver#defaultTinyliciousPort}
     */
    port?: number;

    /**
     * Optional. Override of the domain
     * @defaultValue - {@link @fluidframework/tinylicious-driver#defaultTinyliciousEndpoint}
     */
    domain?: string;
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

/**
 * Since Tinylicious provides user names for all of its members, we extend the `IUser` interface to include
 * this service-specific value.
 */
export interface TinyliciousUser extends IUser {
    /**
     * The user's name
     */
    name: string;
}

/**
 * Since Tinylicious provides user names for all of its members, we extend the `IMember` interface to include
 * this service-specific value. It will be returned for all audience members connected to Tinylicious.
 */
export interface TinyliciousMember extends IMember {
    /**
     * {@inheritDoc TinyliciousUser.name}
     */
    userName: string;
}

/**
 * Tinylicious-specific {@link @fluidframework/fluid-static#IServiceAudience} implementation.
 */
export type ITinyliciousAudience = IServiceAudience<TinyliciousMember>;
