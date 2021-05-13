/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionMode } from "@fluidframework/protocol-definitions";

export interface TinyliciousContainerConfig {
    id: string;
}

export interface TinyliciousConnectionConfig {
    port?: number;
}

/**
 * Base interface to be implemented to fetch each service's audience. The generic C allows consumers to further
 * extend the client object with service-specific details about the connecting client, such as device information,
 * environme
 */
export interface IServiceAudience<M extends IMember> {
    /**
     * Returns an map of all users currently in the Fluid session where key is the userId and the value is the
     * member object
     */
    getMembers(): Map<string, M>;

    /**
     * Returns the current active user on this client once they are connected. Otherwise, returns undefined.
     */
    getCurrentMember(): M | undefined;

    /**
     * Returns the current client's details once it is connected. Otherwise, returns undefined.
     */
    getCurrentClient(): IConnectedClient | undefined;

    /**
     * Collection of event listeners that trigger if the members in the Fluid session change and if a member makes an
     * edit which updates when the last change was made
     */
    on(event: "membersChanged", listener: (members: M[]) => void): this;
    on(event: "lastEditedMemberChanged", listener: (member: M) => void): this;
    off(event: "membersChanged", listener: (members: M[]) => void): this;
    off(event: "lastEditedMemberChanged", listener: (member: M) => void): this;
    once(event: "membersChanged", listener: (members: M[]) => void): this;
    once(event: "lastEditedMemberChanged", listener: (member: M) => void): this;
}

/**
 * Base interface for providing client information for each connection made to the Fluid session, which will be
 * different even if it is by the same user, i.e. the clientId will be uniquely generated for each time the user
 * connects and each indvidiual connection will track its own time that it was last active at. This interface
 * can be extended to provide additional information specific to each service.
 */
export interface IConnectedClient {
    clientId: string;
    connectionMode: ConnectionMode;
    timeLastActive?: Date;
}

/**
 * Base interace to be implemented to fetch each service's member. The user ID is unique for each individual
 * user that is connecting to the session. However, one user may be connecting through multiple clients and
 * the information for each is provided within connectedClients. The list of clients here is sorted based on
 * descending order from who made the most recent edit. This interface can be extended by each service
 * to provide additional service-specific user metadata.
 */
export interface IMember {
    userId: string;
    connectedClients: IConnectedClient[];
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

export type TinyliciousMember = IMember;

export type ITinyliciousAudience = IServiceAudience<TinyliciousMember>;
