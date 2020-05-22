/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IClient } from "@fluidframework/protocol-definitions";

/**
 * Audience represents all clients connected to the op stream.
 */
export interface IAudience extends EventEmitter {

    on(event: "addMember", listener: (clientId: string, details: IClient) => void): this;
    on(event: "removeMember", listener: (clientId: string) => void): this;

    getMembers(): Map<string, IClient>;

    getMember(clientId: string): IClient | undefined;

}
