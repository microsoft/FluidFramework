/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IClient,
	INack,
	ISignalClient,
	ISignalMessage,
	MessageType,
	NackErrorType,
} from "@fluidframework/protocol-definitions";

export const createNackMessage = (
	code: number,
	type: NackErrorType,
	message: string,
	retryAfterInSec?: number,
): INack => ({
	operation: undefined,
	sequenceNumber: -1,
	content: {
		code,
		type,
		message,
		retryAfter: retryAfterInSec,
	},
});

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

export const createRoomLeaveMessage = (clientId: string): ISignalMessage => ({
	clientId: null,
	content: JSON.stringify({
		type: MessageType.ClientLeave,
		content: clientId,
	}),
});

export const IBroadcastSignalEventPayloadType = {
	/**
	 * Indicates that the data associated with an edit is or must be a `boolean`.
	 */
	RuntimeMessage: "RuntimeMessage",
} as const;

export const createRuntimeMessage = (signalContent: string): ISignalMessage => ({
	clientId: null,
	content: JSON.stringify({
		type: IBroadcastSignalEventPayloadType.RuntimeMessage,
		contents: JSON.parse(signalContent),
	}),
});
