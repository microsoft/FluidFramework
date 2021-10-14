/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDocument } from "@fluidframework/server-services-core";
import { Lumberjack, BaseTelemetryProperties } from "@fluidframework/server-services-telemetry";

export async function deleteSummarizedOps(
    opCollection: ICollection<unknown>,
    documentsCollection: ICollection<IDocument>,
    softDeleteRetentionPeriodMs: number,
    offlineWindowMs: number,
    opsDeletionEnabled: boolean): Promise<void> {
    if (!opsDeletionEnabled) {
        return Promise.reject(new Error(`Operation deletion is not enabled`));
    }
    // eslint-disable-next-line no-null/no-null
    const documentsArray = await documentsCollection.distinct("documentId", { documentId : { $ne : null } });
    const currentEpochTime = new Date().getTime();
    const epochTimeBeforeOfflineWindow =  currentEpochTime - offlineWindowMs;
    const scheduledDeletionEpochTime = currentEpochTime + softDeleteRetentionPeriodMs;
    let lumberjackProperties;

    for (const docId of documentsArray) {
        try {
            const document = await documentsCollection.findOne({ documentId: docId });
            lumberjackProperties = {
                [BaseTelemetryProperties.tenantId]: document.tenantId,
                [BaseTelemetryProperties.documentId]: docId,
            };
            const lastSummarySequenceNumber = JSON.parse(document.scribe).lastSummarySequenceNumber;

            // first "soft delete" operations older than the offline window, which have been summarised
            // soft delete is done by setting a scheduled deletion time
            await opCollection.updateMany({
                $and: [
                    {
                        documentId: docId,
                    },
                    {
                        "operation.timestamp": { $lte: epochTimeBeforeOfflineWindow },
                    },
                    {
                        "operation.sequenceNumber": { $lte: lastSummarySequenceNumber },
                    },
                    {
                        scheduledDeletionTime: { $exists: false },
                    },
                ]},
                { scheduledDeletionTime: scheduledDeletionEpochTime },
                undefined);

            // then permanently delete ops that have passed their retention period
            // delete if current epoch time is greater than the scheduled deletion time of the op
            await opCollection.deleteMany({
                    documentId: docId,
                    scheduledDeletionTime: { $lte: currentEpochTime },
                });
        } catch (error) {
            Lumberjack.error(`Error while trying to delete ops`, lumberjackProperties, error);
            throw error;
        }
    }
}
