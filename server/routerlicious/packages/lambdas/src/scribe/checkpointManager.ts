/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";
import {
    ICollection,
    IContext,
    IDocument,
    isRetryEnabled,
    IScribe,
    ISequencedOperationMessage,
    runWithRetry,
    IDeltaService,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICheckpointManager } from "./interfaces";

/**
 * MongoDB specific implementation of ICheckpointManager
 */
export class CheckpointManager implements ICheckpointManager {
    private readonly clientFacadeRetryEnabled: boolean;
    constructor(
        protected readonly context: IContext,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly documentCollection: ICollection<IDocument>,
        private readonly opCollection: ICollection<ISequencedOperationMessage>,
        private readonly deltaService: IDeltaService,
        private readonly getDeltasViaAlfred: boolean
    ) {
        this.clientFacadeRetryEnabled = isRetryEnabled(this.opCollection);
    }

    /**
     * Writes the checkpoint information to MongoDB
     */
    public async write(
        checkpoint: IScribe,
        protocolHead: number,
        pending: ISequencedOperationMessage[]) {
        if (this.getDeltasViaAlfred) {
            if (pending.length > 0) {
                // Verify that the last pending op has been persisted to op storage
                // If it is, we can checkpoint
                const expectedSequenceNumber = pending[pending.length - 1].operation.sequenceNumber;
                const lastDelta = await this.deltaService.getDeltas("", this.tenantId, this.documentId, expectedSequenceNumber-1, expectedSequenceNumber + 1);
                
                // If we don't get the expected delta, retry after a delay
                if (lastDelta.length === 0 || lastDelta[0].sequenceNumber < expectedSequenceNumber) {
                    const lumberjackProperties = {
                        ...getLumberBaseProperties(this.documentId, this.tenantId),
                        expectedSequenceNumber,
                        lastDelta: lastDelta.length > 0 ? lastDelta[0].sequenceNumber: -1
                    }
                    Lumberjack.info(`Pending ops were not been persisted to op storage. Retrying after delay`, lumberjackProperties);
                    await delay(1500);
                    const lastDelta1 = await this.deltaService.getDeltas("", this.tenantId, this.documentId, expectedSequenceNumber-1, expectedSequenceNumber + 1);

                    if (lastDelta1.length === 0 || lastDelta1[0].sequenceNumber < expectedSequenceNumber) {
                        const errMsg = "Pending ops were not been persisted to op storage. Checkpointing failed";
                        Lumberjack.error(errMsg, lumberjackProperties);
                        throw new Error(errMsg);
                    }

                    Lumberjack.info(`Verified on retry that pending ops are persisted`, getLumberBaseProperties(this.documentId, this.tenantId));
                }
            }

            await this.writeScribeCheckpointState(checkpoint);
        } else {
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
            const dbOps = pending.map((message) => ({
                ...message,
                mongoTimestamp: new Date(message.operation.timestamp)
            }));
            if (dbOps.length > 0) {
                await runWithRetry(
                    async () => this.opCollection.insertMany(dbOps, false),
                    "writeCheckpointScribe",
                    3 /* maxRetries */,
                    1000 /* retryAfterMs */,
                    getLumberBaseProperties(this.documentId, this.tenantId),
                    (error) => error.code === 11000 /* shouldIgnoreError */,
                    (error) => !this.clientFacadeRetryEnabled, /* shouldRetry */
                );
            }

            // Write out the full state first that we require
            await this.writeScribeCheckpointState(checkpoint);

            // And then delete messagses that were already summarized.
            await this.opCollection.deleteMany({
                "documentId": this.documentId,
                "operation.sequenceNumber": { $lte: protocolHead },
                "tenantId": this.tenantId,
            });
        }
    }

    private async writeScribeCheckpointState(checkpoint: IScribe) {
        await this.documentCollection.update(
            {
                documentId: this.documentId,
                tenantId: this.tenantId,
            },
            {
                // MongoDB is particular about the format of stored JSON data. For this reason we store stringified
                // given some data is user generated.
                scribe: JSON.stringify(checkpoint),
            },
            null);
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
