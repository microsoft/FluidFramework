/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ConnectionState, MessageType } from "@microsoft/fluid-protocol-definitions";

/**
 * Check if the string is a system message type, which includes
 * MessageType.RemoteHelp, MessageType.Integrate, MessageType.ClientJoin,
 * MessageType.ClientLeave, MessageType.Fork
 *
 * @param type - the type to check
 * @returns true if it is a system message type
 */
export const isSystemType = (type: string) => (
    type === MessageType.RemoteHelp ||
        type === MessageType.Integrate ||
        type === MessageType.ClientJoin ||
        type === MessageType.ClientLeave ||
        type === MessageType.Fork ||
        type === MessageType.Control);

export function raiseConnectedEvent(emitter: EventEmitter, state: ConnectionState, clientId?: string) {
    if (state === ConnectionState.Connected) {
        emitter.emit("connected", clientId);
    } else if (state === ConnectionState.Connecting) {
        emitter.emit("joining");
    } else {
        emitter.emit("disconnected");
    }
}
