/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, ISignalClient, ISignalMessage } from "@fluidframework/protocol-definitions";

/**
 * Represents a client that has some sequence numbers attached
 */
export interface ISequencedSignalClient {
    /**
     * The client object
     */
    client: IClient;

    /**
     * Counts the number of signals sent by the client
     */
    clientConnectionNumber: number;

    /**
     * Sequence number that indicates when the signal was created in relation to the delta stream
     */
    referenceSequenceNumber: number;

    /**
     * The time when the client will expire.
     * The client will expire if Date.now() exceeds this value.
     */
    exp: number;
}

/**
 * Manages the list of clients connected to the websocket.
 */
export interface IClientManager {
    /**
     * Adds a client to the list.
     */
    addClient(
        tenantId: string,
        documentId: string,
        clientId: string,
        details: IClient,
        signalMessage?: ISignalMessage): Promise<void>;

    /**
     * Removes a client from the list.
     */
    removeClient(tenantId: string, documentId: string, clientId: string, signalMessage?: ISignalMessage): Promise<void>;

    /**
     * Returns all clients currently connected.
     */
    getClients(tenantId: string, documentId: string): Promise<ISignalClient[]>;

    /**
     * Returns all clients currently connected including a keep alive time.
     * Should be used with delis read only client functionality.
     */
    getSequencedClients(tenantId: string, documentId: string): Promise<Map<string, ISequencedSignalClient>>;

    /**
     * Called when the expiration time of clients should be extended.
     * @param clientTimeout - Amount of time in milliseconds to add to the clients expiration time.
     */
    extendSequencedClients(
        tenantId: string,
        documentId: string,
        clients: Map<string, ISequencedSignalClient>,
        clientTimeout: number): Promise<void>;
}
