/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, ISignalClient } from "@fluidframework/protocol-definitions";
import { IClientManager } from "@fluidframework/server-services-core";
import { Redis } from "ioredis";
import * as winston from "winston";

// Manages the set of connected clients in redis hashes with an expiry of 'expireAfterSeconds'.
export class ClientManager implements IClientManager {
    private readonly addAsync: any;
    private readonly removeAsync: any;
    private readonly findAllAsync: any;
    private readonly expire: any;

    constructor(
        client: Redis,
        private readonly expireAfterSeconds = 60 * 60 * 24,
        private readonly prefix = "client") {
        this.addAsync = client.hmset.bind(client);
        this.removeAsync = client.hdel.bind(client);
        this.findAllAsync = client.hgetall.bind(client);
        this.expire = client.expire.bind(client);

        client.on("error", (error) => {
            winston.error("Client Manager Redis Error:", error);
        });
    }

    public async addClient(tenantId: string, documentId: string, clientId: string, details: IClient): Promise<void> {
        const result = await this.addAsync(this.getKey(tenantId, documentId), clientId, JSON.stringify(details));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result !== "OK" ?
            Promise.reject(result) :
            this.expire(this.getKey(tenantId, documentId), this.expireAfterSeconds);
    }

    public async removeClient(tenantId: string, documentId: string, clientId: string): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.removeAsync(this.getKey(tenantId, documentId), clientId);
    }

    public async getClients(tenantId: string, documentId: string): Promise<ISignalClient[]> {
        const dbClients = await this.findAllAsync(this.getKey(tenantId, documentId));
        const clients: ISignalClient[] = [];
        if (dbClients) {
            for (const clientId of Object.keys(dbClients)) {
                clients.push(
                    {
                        clientId,
                        client: JSON.parse(dbClients[clientId]),
                    },
                );
            }
        }
        return clients;
    }

    private getKey(tenantId: string, documentId: string): string {
        return `${this.prefix}:${tenantId}:${documentId}`;
    }
}
