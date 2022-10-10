/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

export type ConnectionMode = "write" | "read";

export interface ICapabilities {
    interactive: boolean;
}
export interface IClientDetails {
    capabilities: ICapabilities;
    type?: string;
    /**
     * If the environment needs to specify multiple properties which gives info about the environment, then
     * it should be in particular format like: "prop1:val1;prop2:val2;prop3:val3"
     */
    environment?: string;
    device?: string;
}

export interface IClient {
    mode: ConnectionMode;
    details: IClientDetails;
    permission: string[];
    user: IUser;
    scopes: string[];

    /**
     * The time the client connected
     */
    timestamp?: number;
}

export interface ISequencedClient {
    client: IClient;

    sequenceNumber: number;
}

export interface ISignalClient {
    clientId: string;

    client: IClient;

    /**
     * Counts the number of signals sent by the client
     */
    clientConnectionNumber?: number;

    /**
     * Sequence number that indicates when the signal was created in relation to the delta stream
     */
    referenceSequenceNumber?: number;
}

/**
 * Contents sent with a ClientJoin message
 */
export interface IClientJoin {
    // The ID of the joining client
    clientId: string;

    // Details about the joining client (i.e. browser based, server, CPU, memory, etc...)
    detail: IClient;
}
