/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDocument } from "@fluidframework/server-services-core";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

export async function deleteSummarizedOps(
    opCollection: ICollection<unknown>,
    documentsCollection: ICollection<IDocument>,
    softDeleteRetentionPeriodMs: number,
    offlineWindowMs: number,
    softDeletionEnabled: boolean,
    permanentOpsDeletionEnabled: boolean): Promise<void> {
        if (!softDeletionEnabled) {
            return Promise.reject(new Error(`Operation deletion is not enabled`));
        }

        const uniqueDocuments = await documentsCollection.aggregate(
            { _id: { documentId: "$documentId", tenantId: "$tenantId"}},
        ).toArray();

        const currentEpochTime = new Date().getTime();
        const epochTimeBeforeOfflineWindow =  currentEpochTime - offlineWindowMs;
        const scheduledDeletionEpochTime = currentEpochTime + softDeleteRetentionPeriodMs;
        let lumberjackProperties;

        for (const doc of uniqueDocuments) {
            try {
                lumberjackProperties = getLumberBaseProperties(doc.documentId, doc.tenantId);
                const lastSummarySequenceNumber = JSON.parse(doc.scribe).lastSummarySequenceNumber;

                // first "soft delete" operations older than the offline window, which have been summarised
                // soft delete is done by setting a scheduled deletion time
                await opCollection.updateMany({
                    $and: [
                        {
                            documentId: doc.documentId,
                        },
                        {
                            tenantId: doc.tenantId,
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

                if (permanentOpsDeletionEnabled) {
                    // then permanently delete ops that have passed their retention period
                    // delete if current epoch time is greater than the scheduled deletion time of the op
                    await opCollection.deleteMany({
                        documentId: doc.documentId,
                        tenantId: doc.tenantId,
                        scheduledDeletionTime: { $lte: currentEpochTime },
                    });
                }
            } catch (error) {
                Lumberjack.error(`Error while trying to delete ops`, lumberjackProperties, error);
                throw error;
            }
        }
}
