/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { assert } from "@fluidframework/core-utils/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions/internal";
import { CombinedAppAndProtocolSummary } from "@fluidframework/driver-utils/internal";

// eslint-disable-next-line import/no-deprecated
import { IDetachedBlobStorage } from "./loader.js";
import type { SnapshotWithBlobs } from "./serializedStateManager.js";
import { getSnapshotTreeAndBlobsFromSerializedContainer } from "./utils.js";

/**
 * The default state a newly created detached container will have.
 * All but the state are optional and undefined, they just exist
 * to make the union easy to deal with for both Detached types
 */
export interface DetachedDefaultData {
	readonly state: AttachState.Detached;
	readonly blobs?: undefined;
	readonly summary?: undefined;
	readonly redirectTable?: undefined;
}

/**
 * This always follows DetachedDefaultData when there are
 * outstanding blobs in the detached blob storage.
 * The redirect table will get filled up to include data
 * about the blobs as they are uploaded.
 */
export interface DetachedDataWithOutstandingBlobs {
	readonly state: AttachState.Detached;
	readonly blobs: "outstanding";
	readonly summary?: undefined;
	readonly redirectTable: Map<string, string>;
}

/**
 * This state always follows DetachedDataWithOutstandingBlobs.
 * It signals that all outstanding blobs are done being uploaded,
 * so the container can move to the attaching state.
 */
export interface AttachingDataWithBlobs {
	readonly state: AttachState.Attaching;
	readonly blobs: "done";
	readonly summary: CombinedAppAndProtocolSummary;
}

/**
 * This always follows DefaultDetachedState when there are
 * no blobs in the detached blob storage. Because there are
 * no blobs we can immediately get the summary and transition
 * to the attaching state.
 */
export interface AttachingDataWithoutBlobs {
	readonly state: AttachState.Attaching;
	readonly summary: CombinedAppAndProtocolSummary;
	readonly blobs: "none";
}

/**
 * The final attachment state which signals the container is fully attached.
 * The baseSnapshotAndBlobs will only be enabled when offline load is enabled.
 */
export interface AttachedData {
	readonly state: AttachState.Attached;
}

/**
 * A union of all the attachment data types for
 * tracking across all container attachment states
 */
export type AttachmentData =
	| DetachedDefaultData
	| DetachedDataWithOutstandingBlobs
	| AttachingDataWithoutBlobs
	| AttachingDataWithBlobs
	| AttachedData;

/**
 * The data and services necessary for runRetriableAttachProcess.
 */
export interface AttachProcessProps {
	/**
	 * The initial attachment data this call should start with
	 */
	readonly initialAttachmentData: Exclude<AttachmentData, AttachedData>;

	/**
	 * The caller should use this callback to keep track of the current
	 * attachment data, and perform any other operations necessary
	 * for dealing with attachment state changes, like emitting events
	 *
	 * @param attachmentData - the updated attachment data	 */
	readonly setAttachmentData: (attachmentData: AttachmentData) => void;

	/**
	 * The caller should create and or get services based on the data, and its own information.
	 * @param data - the data to create services from,
	 * the summary property being the most relevant part of the data.
	 * @returns A compatible storage service
	 */
	readonly createOrGetStorageService: (
		data: ISummaryTree | undefined,
	) => Promise<Pick<IDocumentStorageService, "createBlob" | "uploadSummaryWithContext">>;

	/**
	 * The detached blob storage if it exists.
	 */
	// eslint-disable-next-line import/no-deprecated
	readonly detachedBlobStorage?: Pick<IDetachedBlobStorage, "getBlobIds" | "readBlob" | "size">;

	/**
	 * The caller should create the attachment summary for the container.
	 * @param redirectTable - Maps local blob ids to remote blobs ids.
	 * @returns The attachment summary for the container.
	 */
	readonly createAttachmentSummary: (
		redirectTable?: Map<string, string>,
	) => CombinedAppAndProtocolSummary;

	/**
	 * Whether offline load is enabled or not.
	 */
	readonly offlineLoadEnabled: boolean;
}

/**
 * Executes the attach process state machine based on the provided data and services.
 * This method is retriable on failure. Based on the provided initialAttachmentData
 * this method will resume the attachment process and attempt to complete it.
 *
 * @param AttachProcessProps - The data and services necessary to run the attachment process
 * @returns - The attach summary (only if offline load is enabled), or undefined
 */
export const runRetriableAttachProcess = async ({
	detachedBlobStorage,
	createOrGetStorageService,
	setAttachmentData,
	createAttachmentSummary,
	offlineLoadEnabled,
	initialAttachmentData,
}: AttachProcessProps): Promise<SnapshotWithBlobs | undefined> => {
	let currentData: AttachmentData = initialAttachmentData;

	if (currentData.blobs === undefined) {
		// If attachment blobs were uploaded in detached state we will go through a different attach flow
		const outstandingAttachmentBlobs =
			detachedBlobStorage !== undefined && detachedBlobStorage.size > 0;
		// Determine the next phase of attaching which depends on if there are attachment blobs
		// if there are, we will stay detached, so an empty file can be created, and the blobs
		// uploaded, otherwise we will get the summary to create the file with and move to attaching
		currentData = outstandingAttachmentBlobs
			? {
					state: AttachState.Detached,
					blobs: "outstanding",
					redirectTable: new Map<string, string>(),
			  }
			: {
					state: AttachState.Attaching,
					summary: createAttachmentSummary(),
					blobs: "none",
			  };
		setAttachmentData(currentData);
	}

	// this has to run here, as it is what creates the file
	// and we need to file for all possible cases after this point
	const storage = await createOrGetStorageService(currentData.summary);

	if (currentData.blobs === "outstanding") {
		const { redirectTable } = currentData;
		// upload blobs to storage
		assert(!!detachedBlobStorage, 0x24e /* "assertion for type narrowing" */);

		// build a table mapping IDs assigned locally to IDs assigned by storage and pass it to runtime to
		// support blob handles that only know about the local IDs
		while (redirectTable.size < detachedBlobStorage.size) {
			const newIds = detachedBlobStorage.getBlobIds().filter((id) => !redirectTable.has(id));
			for (const id of newIds) {
				const blob = await detachedBlobStorage.readBlob(id);
				const response = await storage.createBlob(blob);
				redirectTable.set(id, response.id);
			}
		}
		setAttachmentData(
			(currentData = {
				state: AttachState.Attaching,
				summary: createAttachmentSummary(redirectTable),
				blobs: "done",
			}),
		);
	}

	assert(
		currentData.state === AttachState.Attaching,
		0x8e2 /* must be attaching by this point */,
	);

	if (currentData.blobs === "done") {
		// done means outstanding blobs were uploaded.
		// in that case an empty file was created, the blobs were uploaded
		// and now this finally uploads the summary
		await storage.uploadSummaryWithContext(currentData.summary, {
			referenceSequenceNumber: 0,
			ackHandle: undefined,
			proposalHandle: undefined,
		});
	}

	const snapshot: SnapshotWithBlobs | undefined = offlineLoadEnabled
		? getSnapshotTreeAndBlobsFromSerializedContainer(currentData.summary)
		: undefined;

	setAttachmentData(
		(currentData = {
			state: AttachState.Attached,
		}),
	);
	return snapshot;
};
