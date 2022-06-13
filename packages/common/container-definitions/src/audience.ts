/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IClient } from "@fluidframework/protocol-definitions";

/**
 * Audience represents all clients connected to the op stream, both read-only and read/write.
 */
export interface IAudience extends EventEmitter {

    on(event: "addMember" | "removeMember", listener: (clientId: string, client: IClient) => void): this;

    /** List all clients connected to the op stream, keyed off their clientId */
    getMembers(): Map<string, IClient>;

    /**
     * Get details about the connected client with the specified clientId,
     * or undefined if the specified client isn't connected
     */
    getMember(clientId: string): IClient | undefined;
}
