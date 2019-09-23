/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, ISignalClient } from "@microsoft/fluid-protocol-definitions";
import { IClientManager } from "@microsoft/fluid-server-services-core";
import { RedisClient } from "redis";
import * as util from "util";

// Manages the set of connected clients in redis hashes with an expiry of 'expireAfterSeconds'.
export class ClientManager implements IClientManager {
    private addAsync: any;
    private removeAsync: any;
    private findAllAsync: any;
    private expire: any;

    constructor(client: RedisClient, private expireAfterSeconds = 60 * 60 * 24,  private prefix = "client") {
        this.addAsync = util.promisify(client.hmset.bind(client));
        this.removeAsync = util.promisify(client.hdel.bind(client));
        this.findAllAsync = util.promisify(client.hgetall.bind(client));
        this.expire = util.promisify(client.expire.bind(client));
    }

    public async addClient(tenantId: string, documentId: string, clientId: string, details: IClient): Promise<void> {
        const result = await this.addAsync(this.getKey(tenantId, documentId), clientId, JSON.stringify(details));
        return result !== "OK" ?
            Promise.reject(result) :
            this.expire(this.getKey(tenantId, documentId), this.expireAfterSeconds);
    }

    public async removeClient(tenantId: string, documentId: string, clientId: string): Promise<void> {
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
