/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import {
	IDocumentMessage,
	IDocumentSystemMessage,
	IProtocolState,
	IUser,
} from "@fluidframework/protocol-definitions";
import {
	IProducer,
	IRawOperationMessage,
	RawOperationType,
	type IScribe,
} from "@fluidframework/server-services-core";

export const initializeProtocol = (protocolState: IProtocolState): ProtocolOpHandler =>
	new ProtocolOpHandler(
		protocolState.minimumSequenceNumber,
		protocolState.sequenceNumber,
		protocolState.members,
		protocolState.proposals,
		protocolState.values,
		() => -1,
	);

export const sendToDeli = async (
	tenantId: string,
	documentId: string,
	producer: IProducer | undefined,
	operation: IDocumentMessage | IDocumentSystemMessage,
): Promise<void> => {
	if (!producer) {
		throw new Error("Invalid producer");
	}

	const message: IRawOperationMessage = {
		clientId: null,
		documentId,
		operation,
		tenantId,
		timestamp: Date.now(),
		type: RawOperationType,
	};

	return producer.send([message], tenantId, documentId);
};

export const getClientIds = (protocolState: IProtocolState, clientCount: number): string[] => {
	return protocolState.members.slice(0, clientCount).map((member) => member[0]);
};

/**
 * Whether to write checkpoint to local db.
 * @param noActiveClients - whether there are any active clients
 * @param globalCheckpointOnly - whether to always write checkpoints to global db
 * @returns whether to write checkpoint to local db
 */
export const isLocalCheckpoint = (
	noActiveClients: boolean,
	globalCheckpointOnly: boolean,
): boolean => {
	return !isGlobalCheckpoint(noActiveClients, globalCheckpointOnly);
};
/**
 * Whether to write checkpoint to global db.
 * @param noActiveClients - whether there are any active clients
 * @param globalCheckpointOnly - whether to always write checkpoints to global db
 * @returns whether to write checkpoint to global db
 */
export const isGlobalCheckpoint = (
	noActiveClients: boolean,
	globalCheckpointOnly: boolean,
): boolean => {
	return noActiveClients || globalCheckpointOnly;
};

/**
 * Whether the quorum members represented in the checkpoint's protocol state have had their user data scrubbed
 * for privacy compliance.
 */
export const isScribeCheckpointQuorumScrubbed = (
	checkpoint: string | IScribe | undefined,
): boolean => {
	if (!checkpoint) {
		return false;
	}
	const parsedCheckpoint: IScribe =
		typeof checkpoint === "string" ? JSON.parse(checkpoint) : checkpoint;
	for (const [, sequencedClient] of parsedCheckpoint.protocolState.members) {
		const user: IUser = sequencedClient.client.user;
		if (!user.id) {
			// User information was scrubbed.
			return true;
		}
	}
	return false;
};
