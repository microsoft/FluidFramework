/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClientDetails } from "@fluidframework/protocol-definitions";

export interface TinyliciousContainerConfig {
    id: string;
}

export interface TinyliciousConnectionConfig {
    port?: number;
}

/**
 * Base interface to be implemented to fetch each service's audience. The generic T here is the unique user
 * object that will contain the user's service-specific metadata
 */
export interface IServiceAudience<T> {
    /**
     * Returns an array of all users currently in the Fluid session
     */
    getMembers(): T[];

    /**
     * Collection of event listeners that trigger if the members in the Fluid session change.
     */
    on(event: "membersChanged", listener: (members: T[]) => void): this;
    off(event: "membersChanged", listener: (members: T[]) => void): this;
    once(event: "membersChanged", listener: (members: T[]) => void): this;
}

/**
 * Base type to be implemented to fetch each service's user object. The client ID is uniquely generated for
 * each connection a user makes with the service and client details provide information regarding the device
 * and environment the user is connecting from. The user details are unique to each service and holds the metadata
 * that the service chooses to provide for the user.
 */
export interface ServiceUser<T> {
    clientId: string;
    clientDetails: IClientDetails;
    userDetails: T;
}

/**
 * TinyliciousContainerServices is returned by the TinyliciousClient alongside a FluidContainer.
 * It holds the functionality specifically tied to the ODSP service, and how the data stored in
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

export interface TinyliciousUserDetails {
    id: string;
}

export type TinyliciousUser = ServiceUser<TinyliciousUserDetails>;

export type ITinyliciousAudience = IServiceAudience<TinyliciousUser>;
