/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, ISignalClient } from "@fluidframework/protocol-definitions";
import { IClientManager } from "@fluidframework/server-services-core";

export class TestClientManager implements IClientManager {
    private readonly clients: Map<string, Map<string, Map<string, IClient>>> = new Map();

    public async addClient(tenantId: string, documentId: string, clientId: string, details: IClient): Promise<void> {
        if (!this.clients.has(tenantId)) {
            this.clients.set(tenantId, new Map());
        }
        if (!this.clients.get(tenantId).has(documentId)) {
            this.clients.get(tenantId).set(documentId, new Map());
        }

        this.clients.get(tenantId).get(documentId).set(clientId, details);
    }
    public async removeClient(tenantId: string, documentId: string, clientId: string): Promise<void> {
        if (this.clients.has(tenantId) && this.clients.get(tenantId).has(documentId)) {
            this.clients.get(tenantId).get(documentId).delete(clientId);
        }
    }
    public async getClients(tenantId: string, documentId: string): Promise<ISignalClient[]> {
        const signalClients: ISignalClient[] = [];
        if (this.clients.has(tenantId) && this.clients.get(tenantId).has(documentId)) {
            for (const [clientId, client] of this.clients.get(tenantId).get(documentId)) {
                signalClients.push({
                    clientId,
                    client,
                });
            }
        }
        return signalClients;
    }
}
