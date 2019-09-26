/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAudience } from "@microsoft/fluid-container-definitions";
import { IClient } from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";

/**
 * Audience represents all clients connected to the op stream.
 */
export class Audience extends EventEmitter implements IAudience {
    private readonly members = new Map<string, IClient>();

    /**
     * Adds a new client to the audience
     */
    public addMember(clientId: string, details: IClient) {
        this.members.set(clientId, details);
        this.emit("addMember", clientId, details);
    }

    /**
     * Removes a client from the audience
     */
    public removeMember(clientId: string) {
        this.members.delete(clientId);
        this.emit("removeMember", clientId);
    }

    /**
     * Retrieves all the members in the audience
     */
    public getMembers(): Map<string, IClient> {
        return new Map(this.members);
    }

    /**
     * Retrieves a specific member of the audience
     */
    public getMember(clientId: string): IClient | undefined {
        return this.members.get(clientId);
    }

    /**
     * Clears the audience
     */
    public clear(): void {
        const clientIds = this.members.keys();
        for (const clientId of clientIds) {
            this.removeMember(clientId);
        }
    }
}
