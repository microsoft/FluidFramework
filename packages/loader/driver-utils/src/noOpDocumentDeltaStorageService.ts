/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { IDocumentDeltaStorageService, IStream } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { Queue } from "./parallelRequests";

/**
 * Implementation of IDocumentDeltaStorageService that will always return NoOp when fetching messages
 */
export class NoOpDocumentDeltaStorageService implements IDocumentDeltaStorageService {
    public fetchMessages(from: number,
        _to: number | undefined,
        _abortSignal?: AbortSignal,
        _cachedOnly?: boolean,
        _fetchReason?: string,
    ): IStream<ISequencedDocumentMessage[]> {
        const queue = new Queue<ISequencedDocumentMessage[]>();

        queue.pushValue([{
            clientId: uuid(),
            sequenceNumber: from,
            term: undefined,
            minimumSequenceNumber: from,
            clientSequenceNumber: from,
            referenceSequenceNumber: from,
            type: MessageType.NoOp,
            contents: undefined,
            timestamp: Date.now(),
        }]);
        queue.pushDone();

        return queue;
    }
}
