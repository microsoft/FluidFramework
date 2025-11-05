/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISummaryAck,
	ISummaryNack,
	ISequencedDocumentAugmentedMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import type { IScribe, ISequencedOperationMessage } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface ISummaryWriteResponse {
	message: ISummaryAck | ISummaryNack;
	status: boolean;
}

/**
 * @internal
 */
export interface ILatestSummaryState {
	protocolHead: number;
	scribe: string;
	messages: ISequencedDocumentMessage[];
	fromSummary: boolean;
}

/**
 * Interface to abstract out the storage specific details of summary retrieval
 * @internal
 */
export interface ISummaryReader {
	readLastSummary(): Promise<ILatestSummaryState>;
}

/**
 * Interface to abstract out the storage specific details of summary creation
 * @internal
 */
export interface ISummaryWriter {
	writeClientSummary(
		op: ISequencedDocumentAugmentedMessage,
		lastSummaryHead: string | undefined,
		checkpoint: IScribe,
		pendingOps: ISequencedOperationMessage[],
		isEphemeralContainer?: boolean,
	): Promise<ISummaryWriteResponse>;

	writeServiceSummary(
		op: ISequencedDocumentAugmentedMessage,
		currentProtocolHead: number,
		checkpoint: IScribe,
		pendingOps: ISequencedOperationMessage[],
		isEphemeralContainer?: boolean,
	): Promise<string | false>;

	isExternal: boolean;
}

/**
 * Interface to abstract out the storage specific details of pending message retrieval
 * @internal
 */
export interface IPendingMessageReader {
	/**
	 * Read pending messages
	 * @param from - Starting sequence number (inclusive)
	 * @param to - End sequence number (inclusive)
	 */
	readMessages(from: number, to: number): Promise<ISequencedDocumentMessage[]>;
}

/**
 * Interface to abstract out the storage specific details of scribe checkpointing
 * @internal
 */
export interface ICheckpointManager {
	write(
		checkpoint: IScribe,
		protocolHead: number,
		pendingCheckpointMessages: ISequencedOperationMessage[],
		noActiveClients: boolean,
		globalCheckpointOnly: boolean,
		markAsCorrupt: boolean,
	): Promise<void>;

	delete(sequenceNumber: number, lte: boolean): Promise<void>;
}
