/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AttachState } from "@fluidframework/container-definitions";
import { CombinedAppAndProtocolSummary } from "@fluidframework/driver-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { Lazy, assert } from "@fluidframework/core-utils";
import { getSnapshotTreeAndBlobsFromSerializedContainer } from "./utils";
import { ContainerStorageAdapter, ISerializableBlobContents } from "./containerStorageAdapter";
import { IDetachedBlobStorage } from ".";

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
 * This always follows DefaultDetachedState when there are
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
	readonly baseSnapshotAndBlobs?: Lazy<[ISnapshotTree, ISerializableBlobContents]>;
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

export interface AttachProcessProps {
	readonly attachmentData: AttachmentData;
	readonly setAttachmentData: (attachmentData: AttachmentData) => AttachmentData;
	readonly createServiceIfNotExists: (
		data: DetachedDataWithOutstandingBlobs | AttachingDataWithoutBlobs,
	) => Promise<void>;
	readonly detachedBlobStorage?: Pick<IDetachedBlobStorage, "getBlobIds" | "readBlob" | "size">;
	readonly createAttachmentSummary: (
		redirectTable?: Map<string, string>,
	) => CombinedAppAndProtocolSummary;
	readonly storageAdapter: Pick<
		ContainerStorageAdapter,
		"createBlob" | "uploadSummaryWithContext"
	>;
	readonly offlineLoadEnabled: boolean;
}

export const runRetirableAttachProcess = async (props: AttachProcessProps): Promise<void> => {
	let { attachmentData } = props;

	// if we are already attached, just do nothing and return
	if (attachmentData.state === AttachState.Attached) {
		return;
	}

	if (attachmentData.state === AttachState.Detached && attachmentData.blobs === undefined) {
		// If attachment blobs were uploaded in detached state we will go through a different attach flow
		const outstandingAttachmentBlobs =
			props.detachedBlobStorage !== undefined && props.detachedBlobStorage.size > 0;
		// Determine the next phase of attaching depend if there are attachment blobs
		// if there are, we will stay detached, so an empty file can be creates, and the blobs
		// uploaded, otherwise we will get the summary to create the file with and move to attaching
		attachmentData = props.setAttachmentData(
			outstandingAttachmentBlobs
				? {
						state: AttachState.Detached,
						blobs: "outstanding",
						redirectTable: new Map<string, string>(),
				  }
				: {
						state: AttachState.Attaching,
						summary: props.createAttachmentSummary(),
						blobs: "none",
				  },
		);
	}

	if (
		(attachmentData.state === AttachState.Detached && attachmentData.blobs === "outstanding") ||
		(attachmentData.state === AttachState.Attaching && attachmentData.blobs === "none")
	) {
		await props.createServiceIfNotExists(attachmentData);
	}

	if (attachmentData.state === AttachState.Detached && attachmentData.blobs === "outstanding") {
		const detachedData = attachmentData;
		// upload blobs to storage
		assert(!!props.detachedBlobStorage, 0x24e /* "assertion for type narrowing" */);

		// build a table mapping IDs assigned locally to IDs assigned by storage and pass it to runtime to
		// support blob handles that only know about the local IDs
		while (detachedData.redirectTable.size < props.detachedBlobStorage.size) {
			const newIds = props.detachedBlobStorage
				.getBlobIds()
				.filter((id) => !detachedData.redirectTable.has(id));
			for (const id of newIds) {
				const blob = await props.detachedBlobStorage.readBlob(id);
				const response = await props.storageAdapter.createBlob(blob);
				detachedData.redirectTable.set(id, response.id);
			}
		}
		attachmentData = props.setAttachmentData({
			state: AttachState.Attaching,
			summary: props.createAttachmentSummary(detachedData.redirectTable),
			blobs: "done",
		});
	}

	{
		assert(attachmentData.state === AttachState.Attaching, "must be attaching by this point");
		const attachingData = attachmentData;

		if (attachingData.blobs === "done") {
			await props.storageAdapter.uploadSummaryWithContext(attachingData.summary, {
				referenceSequenceNumber: 0,
				ackHandle: undefined,
				proposalHandle: undefined,
			});
		}

		attachmentData = props.setAttachmentData({
			state: AttachState.Attached,
			baseSnapshotAndBlobs: props.offlineLoadEnabled
				? new Lazy(() =>
						getSnapshotTreeAndBlobsFromSerializedContainer(attachingData.summary),
				  )
				: undefined,
		});
	}
};
