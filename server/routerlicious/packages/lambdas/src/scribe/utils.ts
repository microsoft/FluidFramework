/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import {
	IDocumentMessage,
	IDocumentSystemMessage,
	IProtocolState,
} from "@fluidframework/protocol-definitions";
import {
	IProducer,
	IRawOperationMessage,
	RawOperationType,
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

export const sendToDeli = (
	tenantId: string,
	documentId: string,
	producer: IProducer | undefined,
	operation: IDocumentMessage | IDocumentSystemMessage,
	// eslint-disable-next-line @typescript-eslint/promise-function-async
): Promise<any> => {
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

export const getClientIds = (protocolState: IProtocolState, clientCount: number) => {
	return protocolState.members.slice(0, clientCount).map((member) => member[0]);
};

/**
 * Whether to write checkpoint to local db.
 * @param noActiveClients - whether there are any active clients
 * @param globalCheckpointOnly - whether to always write checkpoints to global db
 * @returns whether to write checkpoint to local db
 */
export const isLocalCheckpoint = (noActiveClients: boolean, globalCheckpointOnly: boolean) => {
	return !isGlobalCheckpoint(noActiveClients, globalCheckpointOnly);
};
/**
 * Whether to write checkpoint to global db.
 * @param noActiveClients - whether there are any active clients
 * @param globalCheckpointOnly - whether to always write checkpoints to global db
 * @returns whether to write checkpoint to global db
 */
export const isGlobalCheckpoint = (noActiveClients: boolean, globalCheckpointOnly: boolean) => {
	return noActiveClients || globalCheckpointOnly;
};
