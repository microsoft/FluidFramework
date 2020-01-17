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

export const createNackMessage = (): INack => ({
    operation: undefined,
    sequenceNumber: -1,
});

export function createRoomJoinMessage(clientId: string, client: IClient): ISignalMessage {
    const joinContent: ISignalClient = {
        clientId,
        client,
    };
    return {
        // eslint-disable-next-line no-null/no-null
        clientId: null,
        content: JSON.stringify({
            type: MessageType.ClientJoin,
            content: joinContent,
        }),
    };
}

export const createRoomLeaveMessage = (clientId: string): ISignalMessage => ({
    // eslint-disable-next-line no-null/no-null
    clientId: null,
    content: JSON.stringify({
        type: MessageType.ClientLeave,
        content: clientId,
    }),
});
