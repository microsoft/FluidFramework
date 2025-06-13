/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CheckpointService, ICollection } from "@fluidframework/server-services-core";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

import { FluidServiceError, FluidServiceErrorCode } from "./errorUtils";

/**
 * @internal
 */
export async function deleteSummarizedOps(
	opCollection: ICollection<unknown>,
	softDeleteRetentionPeriodMs: number,
	offlineWindowMs: number,
	softDeletionEnabled: boolean,
	permanentOpsDeletionEnabled: boolean,
	checkpointService: CheckpointService,
): Promise<void> {
	if (!softDeletionEnabled) {
		const error = new FluidServiceError(
			`Operation deletion is not enabled`,
			FluidServiceErrorCode.FeatureDisabled,
		);
		throw error;
	}

	// Following code would nv
	const uniqueDocumentsCursorFromOps = await opCollection.aggregate([
		{ $group: { _id: { documentId: "$documentId", tenantId: "$tenantId" } } },
	]);
	const uniqueDocumentsFromOps: { tenantId: string; documentId: string }[] =
		await uniqueDocumentsCursorFromOps.toArray();

	const currentEpochTime = new Date().getTime();
	const epochTimeBeforeOfflineWindow = currentEpochTime - offlineWindowMs;
	const scheduledDeletionEpochTime = currentEpochTime + softDeleteRetentionPeriodMs;

	for (const doc of uniqueDocumentsFromOps) {
		const lumberjackProperties = getLumberBaseProperties(doc.documentId, doc.tenantId);
		try {
			const realDoc = await checkpointService.getLatestCheckpoint(
				doc.tenantId,
				doc.documentId,
			);

			if (realDoc === null) {
				Lumberjack.error(
					`Unable to delete ops. Reason: Failed to get latest checkpoint`,
					lumberjackProperties,
				);
				continue;
			}

			const lastSummarySequenceNumber = JSON.parse(realDoc.scribe).lastSummarySequenceNumber;

			// first "soft delete" operations older than the offline window, which have been summarised
			// soft delete is done by setting a scheduled deletion time
			await opCollection.updateMany(
				{
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
					],
				},
				{ scheduledDeletionTime: scheduledDeletionEpochTime },
				undefined,
			);

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
		}
	}
}
