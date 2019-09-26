/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IClient,
    INack,
    ISignalClient,
    ISignalMessage,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";

// tslint:disable no-null-keyword
export function createNackMessage(): INack {
    return {
        operation: undefined,
        sequenceNumber: -1,
    };
}

export function createRoomJoinMessage(clientId: string, client: IClient): ISignalMessage {
    const joinContent: ISignalClient = {
        clientId,
        client,
    };
    return {
        clientId: null,
        content: JSON.stringify({
            type: MessageType.ClientJoin,
            content: joinContent,
        }),
    };
}

export function createRoomLeaveMessage(clientId: string): ISignalMessage {
    return {
        clientId: null,
        content: JSON.stringify({
            type: MessageType.ClientLeave,
            content: clientId,
        }),
    };
}
