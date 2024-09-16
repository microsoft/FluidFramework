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

// TODO: documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
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

// TODO: documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
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

// TODO: documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export const createRoomLeaveMessage = (clientId: string): ISignalMessage => ({
	clientId: null,
	content: JSON.stringify({
		type: MessageType.ClientLeave,
		content: clientId,
	}),
});

/**
 * Mirrors ISignalEnvelope from runtime definitions, for signals that come from an external
 * caller (not sent by a client (so no 'clientBroadcastSignalSequenceNumber') and are always addressed
 * to the Container (so no 'address').
 * @internal
 */
export interface IRuntimeSignalEnvelope {
	contents: {
		type: string;
		content: any;
	};
}

/**
 * Template for runtime messages to be sent to an ongoing client collaboration session.
 */
export const createRuntimeMessage = (signalContent: IRuntimeSignalEnvelope): ISignalMessage => ({
	// clientId is null here as it is set by the server which doesn't have information about the sender
	clientId: null,
	content: JSON.stringify({
		type: "RuntimeMessage",
		contents: signalContent.contents,
	}),
});
