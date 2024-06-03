/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

import {
	compareWithReferenceSnapshot,
	getNormalizedFileSnapshot,
	loadContainer,
	uploadSummary,
} from "@fluid-internal/replay-tool";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { TreeEntry } from "@fluidframework/driver-definitions/internal";
import { FileStorageDocumentName } from "@fluidframework/file-driver/internal";
import {
	IFileSnapshot,
	StaticStorageDocumentServiceFactory,
} from "@fluidframework/replay-driver/internal";

import { SnapshotStorageService } from "./snapshotStorageService.js";

const metadataBlobName = ".metadata";

/**
 * Validates snapshots in the source directory with corresponding snapshots in the destination directory:
 * - Loads a new container with each snapshot in `srcDir`.
 * - Snapshots the container and validates that the snapshot matches with the corresponding snapshot in `destDir`.
 * @param srcDir - The directory containing source snapshots that are to be loaded and validated.
 * @param destDir - The directory containing destination snapshots against which the above snapshots are validated.
 * @param seqToMessage - A map of sequence number to message for the messages in this document.
 */
export async function validateSnapshots(
	srcDir: string,
	destDir: string,
	seqToMessage: Map<number, ISequencedDocumentMessage>,
) {
	const errors: string[] = [];
	// Error handler that reports errors if any while validation.
	const reportError = (description: string, error?: any) => {
		let errorString: string;
		if (error === undefined) {
			errorString = description;
		} else if (error instanceof Error) {
			errorString = `${description}\n${error.stack}`;
		} else {
			errorString = `${description} ${error}`;
		}

		errors.push(errorString);
		const errorsToReport = 5;
		if (errors.length <= errorsToReport) {
			console.error(errorString);
		} else if (errors.length === errorsToReport + 1) {
			console.error("\n!!! Too many errors - stopped reporting errors !!!");
		}
	};

	for (const file of fs.readdirSync(srcDir, { withFileTypes: true })) {
		// Don't process sub-directories or files that do not start with "snapshot_" as these are not supported.
		if (file.isDirectory() || !file.name.startsWith("snapshot_")) {
			continue;
		}

		// We must have a corresponding destination snapshot for the source snapshot.
		const referenceDir = `${destDir}/${file.name}`;
		assert(fs.existsSync(referenceDir), `Destination snapshot does not exist for ${file.name}`);

		const snapshotFileName = file.name.split(".")[0];
		const sourceDir = `${srcDir}/${file.name}`;
		const srcContent = fs.readFileSync(sourceDir, "utf-8");

		try {
			// This function will be called by the storage service when the container is snapshotted. When that happens,
			// validate that snapshot with the destination snapshot.
			const onSnapshotCb = (snapshot: IFileSnapshot) =>
				compareWithReferenceSnapshot(
					getNormalizedFileSnapshot(
						addSummaryMessage(
							snapshot,
							seqToMessage,
							container.deltaManager.lastSequenceNumber,
						),
					),
					`${destDir}/${snapshotFileName}`,
					reportError,
				);
			const storage = new SnapshotStorageService(
				JSON.parse(srcContent) as IFileSnapshot,
				onSnapshotCb,
			);

			const container: IContainer = await loadContainer(
				new StaticStorageDocumentServiceFactory(storage),
				FileStorageDocumentName,
				true,
			);

			await uploadSummary(container);
		} catch (e) {
			if (e instanceof Error) {
				e.message = JSON.stringify(
					{
						sourceDir,
						referenceDir,
						snapshotFileName,
						message: e.message,
					},
					undefined,
					2,
				);
			}
			throw e;
		}
	}

	if (errors.length !== 0) {
		throw new Error(
			`\nErrors while validating source snapshots in ${srcDir}\n ${errors.join("\n")}`,
		);
	}
}

/**
 * Add summary messgage to the "metadata" blob of older snapshots. This is the last message processed when generating
 * summary. In the back compat tests, we do not process any messages before summarizing, so the summary message will be
 * undefined. Add the message corresponding to the sequence number at the time of summary.
 */
function addSummaryMessage(
	snapshot: IFileSnapshot,
	seqToMessage: Map<number, ISequencedDocumentMessage>,
	summaryMessageSequenceNumber: number,
): IFileSnapshot {
	const treeEntries = snapshot.tree.entries;
	for (const entry of treeEntries) {
		if (entry.path === metadataBlobName && entry.type === TreeEntry.Blob) {
			const metadata = JSON.parse(entry.value.contents);
			if (metadata.message === undefined) {
				const referenceMessage = seqToMessage.get(summaryMessageSequenceNumber);
				// Copy over fields from the message as per the properties in ISummaryMetadataMessage. If the test fail
				// because ISummaryMetadataMessage changed, update the fields being copied here.
				metadata.message = {
					clientId: referenceMessage.clientId,
					clientSequenceNumber: referenceMessage.clientSequenceNumber,
					minimumSequenceNumber: referenceMessage.minimumSequenceNumber,
					referenceSequenceNumber: referenceMessage.referenceSequenceNumber,
					sequenceNumber: referenceMessage.sequenceNumber,
					timestamp: referenceMessage.timestamp,
					type: referenceMessage.type,
				};
			}
			entry.value.contents = JSON.stringify(metadata);
		}
	}
	return snapshot;
}
