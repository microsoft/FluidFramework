/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IClient } from "@microsoft/fluid-protocol-definitions";

/**
 * Audience represents all clients connected to the op stream.
 */
export interface IAudience extends EventEmitter {

    getMembers(): Map<string, IClient>;

    getMember(clientId: string): IClient | undefined;

}
