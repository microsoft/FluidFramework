/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, ISignalClient } from "@fluidframework/protocol-definitions";

/**
 * Manages the list of clients connected to the websocket.
 */
export interface IClientManager {
    /**
     * Adds a client to the list.
     */
    addClient(tenantId: string, documentId: string, clientId: string, details: IClient): Promise<void>;

    /**
     * Removes a client from the list.
     */
    removeClient(tenantId: string, documentId: string, clientId: string): Promise<void>;

    /**
     * Returns all clients currently connected.
     */
    getClients(tenantId: string, documentId: string): Promise<ISignalClient[]>;
}
