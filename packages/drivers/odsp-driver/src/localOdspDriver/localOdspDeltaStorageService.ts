/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IDocumentDeltaStorageService, IStream } from "@fluidframework/driver-definitions";
import { Queue, emptyMessageStream } from "@fluidframework/driver-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { validateMessages } from "../odspUtils";

/**
 * Implementation of IDocumentDeltaStorageService that will return snapshot ops when fetching messages
 */
export class LocalOdspDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(
        private readonly logger: ITelemetryLogger,
        private snapshotOps: ISequencedDocumentMessage[],
    ) { }

    public fetchMessages(
        from: number,
        to: number | undefined,
        _abortSignal?: AbortSignal,
        _cachedOnly?: boolean,
        _fetchReason?: string,
    ): IStream<ISequencedDocumentMessage[]> {
        if (this.snapshotOps.length === 0) {
            return emptyMessageStream;
        }

        const queue = new Queue<ISequencedDocumentMessage[]>();
        const messages = this.snapshotOps.filter((op) =>
            op.sequenceNumber >= from && (to === undefined || op.sequenceNumber < to));
        validateMessages("cached", messages, from, this.logger);

        if (messages.length === 0 || messages[0].sequenceNumber !== from) {
            this.snapshotOps = [];
        }
        this.snapshotOps = this.snapshotOps.filter((op) => to !== undefined && op.sequenceNumber >= to);

        queue.pushValue(messages);
        queue.pushDone();
        return queue;
    }
}
