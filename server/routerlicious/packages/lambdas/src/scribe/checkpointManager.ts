/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import {
    ICollection,
    IContext,
    IDocument,
    IScribe,
    ISequencedOperationMessage,
    runWithRetry,
} from "@fluidframework/server-services-core";
import { ICheckpointManager } from "./interfaces";

/**
 * MongoDB specific implementation of ICheckpointManager
 */
export class CheckpointManager implements ICheckpointManager {
    constructor(
        protected readonly context: IContext,
         private readonly tenantId: string,
         private readonly documentId: string,
         private readonly documentCollection: ICollection<IDocument>,
         private readonly opCollection: ICollection<ISequencedOperationMessage>,
    ) {
     }

    /**
     * Writes the checkpoint information to MongoDB
     */
    public async write(
        checkpoint: IScribe,
        protocolHead: number,
        pending: ISequencedOperationMessage[]) {
        // The order of the three operations below is important.
        // We start by writing out all pending messages to the database. This may be more messages that we would
        // have seen at the current checkpoint we are trying to write (because we continue process messages while
        // waiting to write a checkpoint) but is more efficient and simplifies the code path.
        //
        // We then write the update to the document collection. This marks a log offset inside of MongoDB at which
        // point if Kafka restartes we will not do work prior to this logOffset. At this point the snapshot
        // history has been written, all ops needed are written, and so we can store the final mark.
        //
        // And last we delete all mesages in the list prior to the summaryprotocol sequence number. From now on these
        // will no longer be referenced.
        const dbOps = pending.map((message) => ({ ...message,
            mongoTimestamp: new Date(message.operation.timestamp) }));
        if (dbOps.length > 0) {
            await runWithRetry(
                async () => this.opCollection.insertMany(dbOps, false),
                "writeCheckpointScribe",
                3 /* maxRetries */,
                1000 /* retryAfterMs */,
                this.context.log,
                (error) => error.code === 11000 /* shouldIgnoreError */);
        }

        // Write out the full state first that we require
        await this.documentCollection.update(
            {
                documentId: this.documentId,
                tenantId: this.tenantId,
            },
            {
                // MongoDB is particular about the format of stored JSON data. For this reason we store stringified
                // given some data is user generated.
                scribe: JSON.stringify(checkpoint),
                lastSummarizedSequenceNumber: protocolHead,
            },
            null);

        // And then delete messagses that were already summarized.
        await this.opCollection
            .deleteMany({
                "documentId": this.documentId,
                "operation.sequenceNumber": { $lte: protocolHead },
                "tenantId": this.tenantId,
            });
    }

    /**
     * Removes the checkpoint information from MongoDB
     */
    public async delete(sequenceNumber: number, lte: boolean) {
        // Clears the checkpoint information from mongodb.
        await this.documentCollection.update(
            {
                documentId: this.documentId,
                tenantId: this.tenantId,
            },
            {
                scribe: "",
            },
            null);

        // And then delete messagse we no longer will reference
        await this.opCollection
            .deleteMany({
                "documentId": this.documentId,
                "operation.sequenceNumber": lte ? { $lte: sequenceNumber } : { $gte: sequenceNumber },
                "tenantId": this.tenantId,
            });
    }
}
