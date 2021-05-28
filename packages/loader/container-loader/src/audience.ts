/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { IAudience } from "@fluidframework/container-definitions";
import { IClient } from "@fluidframework/protocol-definitions";

/**
 * Audience represents all clients connected to the op stream.
 */
export class Audience extends EventEmitter implements IAudience {
    private readonly members = new Map<string, IClient>();

    public on(event: "addMember", listener: (clientId: string, details: IClient) => void): this;
    public on(event: "removeMember", listener: (clientId: string) => void): this;
    public on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

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
