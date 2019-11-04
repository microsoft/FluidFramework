/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

export type ConnectionMode = "write" | "read";
export type ClientType = "human" | "summarizer" | "agent";
export type ClientEnvironment = "browser" | "node";
export type ClientDevice = "desktop" | "mobile";

export interface ICapabilities {
    interactive: boolean;
}

export interface IClient {
    mode?: ConnectionMode;
    type: ClientType;
    capabilities: ICapabilities;
    environment?: ClientEnvironment;
    device?: ClientDevice;
    permission: string[];
    user: IUser;
    scopes: string[];
}

export interface ISequencedClient {

    client: IClient;

    sequenceNumber: number;
}

export interface ISignalClient {

    clientId: string;

    client: IClient;
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
