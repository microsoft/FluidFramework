/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISummaryAck,
    ISummaryNack,
    ISequencedDocumentAugmentedMessage,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";
import { IScribe, ISequencedOperationMessage } from "@fluidframework/server-services-core";

export interface ISummaryWriteResponse {
    message: ISummaryAck | ISummaryNack;
    status: boolean;
}

export interface ILatestSummaryState {
    term: number;
    protocolHead: number;
    scribe: string;
    messages: ISequencedDocumentMessage[];
    fromSummary: boolean;
}

/**
 * Interface to abstract out the storage specific details of summary retrieval
 */
export interface ISummaryReader {
    readLastSummary(): Promise<ILatestSummaryState>;
}

/**
 * Interface to abstract out the storage specific details of summary creation
 */
export interface ISummaryWriter {
    writeClientSummary(
        op: ISequencedDocumentAugmentedMessage,
        lastSummaryHead: string | undefined,
        checkpoint: IScribe,
        pendingOps: ISequencedOperationMessage[]): Promise<ISummaryWriteResponse>;

    writeServiceSummary(
        op: ISequencedDocumentAugmentedMessage,
        currentProtocolHead: number,
        checkpoint: IScribe,
        pendingOps: ISequencedOperationMessage[]): Promise<boolean>;

    isExternal: boolean;
}

/**
 * Interface to abstract out the storage specific details of pending message retrieval
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
 */
export interface ICheckpointManager {
    write(
        checkpoint: IScribe,
        protocolHead: number,
        pendingCheckpointMessages: ISequencedOperationMessage[]): Promise<void>;

    delete(sequenceNumber: number, lte: boolean): Promise<void>;
}
