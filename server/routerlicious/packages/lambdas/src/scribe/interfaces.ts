/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQuorumSnapshot } from "@fluidframework/protocol-base";
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
        lastSummaryHead: string,
        protocolMinimumSequenceNumber: number,
        protocolSequenceNumber: number,
        quorumSnapshot: IQuorumSnapshot,
        checkpoint: IScribe,
        pendingOps: ISequencedOperationMessage[]): Promise<ISummaryWriteResponse>;

    writeServiceSummary(
        op: ISequencedDocumentAugmentedMessage,
        currentProtocolHead: number,
        checkpoint: IScribe,
        pendingOps: ISequencedOperationMessage[]): Promise<boolean>;
}

/**
 * Interface to abstract out the storage specific details of scribe checkpointing
 */
export interface ICheckpointManager {
    write(
        checkpoint: IScribe,
        protocolHead: number,
        pendingCheckpointMessages: ISequencedOperationMessage[]): Promise<void>;

    delete(sequenceNumber: number, lte: boolean): Promise<void>
}
