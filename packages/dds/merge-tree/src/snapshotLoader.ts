/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { bufferToString } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	ITelemetryLoggerExt,
	UsageError,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { Client } from "./client.js";
import { NonCollabClient, UniversalSequenceNumber } from "./constants.js";
import { MergeTree } from "./mergeTree.js";
import { ISegmentPrivate, opstampUtils, type RemoveOperationStamp } from "./mergeTreeNodes.js";
import { IJSONSegment } from "./ops.js";
import {
	IHasRemovalInfo,
	overwriteInfo,
	type IHasInsertionInfo,
	type SegmentWithInfo,
} from "./segmentInfos.js";
import {
	IJSONSegmentWithMergeInfo,
	MergeTreeChunkV1,
	hasMergeInfo,
} from "./snapshotChunks.js";
import { SnapshotV1 } from "./snapshotV1.js";
import { SnapshotLegacy } from "./snapshotlegacy.js";
import { PriorPerspective } from "./perspective.js";

export class SnapshotLoader {
	private readonly logger: ITelemetryLoggerExt;

	constructor(
		private readonly runtime: IFluidDataStoreRuntime,

		private readonly client: Client,
		private readonly mergeTree: MergeTree,
		logger: ITelemetryLoggerExt,
		private readonly serializer: IFluidSerializer,
	) {
		this.logger = createChildLogger({ logger, namespace: "SnapshotLoader" });
	}

	public async initialize(
		services: IChannelStorageService,
	): Promise<{ catchupOpsP: Promise<ISequencedDocumentMessage[]> }> {
		const headerLoadedP = services.readBlob(SnapshotLegacy.header).then((header) => {
			assert(!!header, 0x05f /* "Missing blob header on legacy snapshot!" */);
			return this.loadHeader(bufferToString(header, "utf8"));
		});

		const catchupOpsP = this.loadBodyAndCatchupOps(headerLoadedP, services);

		catchupOpsP.catch((error) =>
			this.logger.sendErrorEvent({ eventName: "CatchupOpsLoadFailure" }, error),
		);

		await headerLoadedP;

		return { catchupOpsP };
	}

	private async loadBodyAndCatchupOps(
		headerChunkP: Promise<MergeTreeChunkV1>,
		services: IChannelStorageService,
	): Promise<ISequencedDocumentMessage[]> {
		const blobsP = services.list("");
		const headerChunk = await headerChunkP;

		// TODO we shouldn't need to wait on the body being complete to finish initialization.
		// To fully support this we need to be able to process inbound ops for pending segments.
		await this.loadBody(headerChunk, services);

		const blobs = await blobsP;
		if (blobs.length === headerChunk.headerMetadata!.orderedChunkMetadata.length + 1) {
			for (const md of headerChunk.headerMetadata!.orderedChunkMetadata)
				blobs.splice(blobs.indexOf(md.id), 1);
			assert(blobs.length === 1, 0x060 /* There should be only one blob with catch up ops */);

			// TODO: The 'Snapshot.catchupOps' tree entry is purely for backwards compatibility.
			//       (See https://github.com/microsoft/FluidFramework/issues/84)

			return this.loadCatchupOps(services.readBlob(blobs[0]), this.serializer);
		} else if (blobs.length !== headerChunk.headerMetadata!.orderedChunkMetadata.length) {
			throw new Error("Unexpected blobs in snapshot");
		}
		return [];
	}

	private readonly specToSegment = (
		spec: IJSONSegment | IJSONSegmentWithMergeInfo,
	): SegmentWithInfo<IHasInsertionInfo> => {
		if (hasMergeInfo(spec)) {
			const seg = overwriteInfo<IHasInsertionInfo>(this.client.specToSegment(spec.json), {
				insert: {
					type: "insert",
					seq: spec.seq ?? UniversalSequenceNumber,
					clientId:
						spec.client === undefined
							? NonCollabClient
							: this.client.getOrAddShortClientId(spec.client),
				},
			});

			const removes: RemoveOperationStamp[] = [];

			if (spec.removedSeq !== undefined) {
				// this format had a bug where it didn't store all the overlap clients
				// this is for back compat, so we change the singular id to an array
				// this will only cause problems if there is an overlapping delete
				// spanning the snapshot, which should be rare
				const specAsBuggyFormat: IJSONSegmentWithMergeInfo & { removedClient?: string } = spec;
				if (specAsBuggyFormat.removedClient !== undefined) {
					spec.removedClientIds ??= [specAsBuggyFormat.removedClient];
				}
				assert(spec.removedClientIds !== undefined, 0xaac /* must have removedClient ids */);
				const firstRemovedSeq = spec.removedSeq;
				// TODO:ADS To correctly support perspectives from other clients which don't assume they have seen
				// all ops, we need to actually record these in the summary. For now we use fake data, and it turns
				// out ok since none of these values end up being used. (specifically, the 'firstRemovedSeq' is fake
				// for all values other than the actual first remove)
				removes.push(
					...spec.removedClientIds.map(
						(id) =>
							({
								type: "setRemove",
								seq: firstRemovedSeq,
								clientId: this.client.getOrAddShortClientId(id),
							}) as const,
					),
				);
			}
			if (spec.movedSeq !== undefined) {
				assert(
					spec.movedClientIds !== undefined && spec.movedSeqs !== undefined,
					0xaa5 /* must have movedIds ids */,
				);
				assert(
					spec.movedClientIds.length === spec.movedSeqs.length,
					"Expected same length for client ids and seqs",
				);

				removes.push(
					...spec.movedClientIds.map(
						(id, i) =>
							({
								type: "sliceRemove",
								seq: spec.movedSeqs![i],
								clientId: this.client.getOrAddShortClientId(id),
							}) as const,
					),
				);
			}

			if (removes.length > 0) {
				removes.sort(opstampUtils.compare);
				overwriteInfo<IHasRemovalInfo>(seg, { removes });
			}

			return seg;
		}
		return overwriteInfo(this.client.specToSegment(spec), {
			insert: {
				type: "insert",
				seq: UniversalSequenceNumber,
				clientId: NonCollabClient,
			},
		});
	};

	private loadHeader(header: string): MergeTreeChunkV1 {
		const chunk = SnapshotV1.processChunk(
			SnapshotLegacy.header,
			header,
			this.logger,
			this.mergeTree.options,
			this.serializer,
		);
		const segs = chunk.segments.map((element) => this.specToSegment(element));
		this.extractAttribution(segs, chunk);

		this.mergeTree.reloadFromSegments(segs);

		if (chunk.headerMetadata === undefined) {
			throw new Error("header metadata not available");
		}
		// If we load a detached container from snapshot, then we don't supply a default clientId
		// because we don't want to start collaboration.
		if (this.runtime.attachState !== AttachState.Detached) {
			// specify a default client id, "snapshot" here as we
			// should enter collaboration/op sending mode if we load
			// a snapshot in any case (summary or attach message)
			// once we get a client id this will be called with that
			// clientId in the connected event
			this.client.startOrUpdateCollaboration(
				this.runtime.clientId ?? "snapshot",

				// TODO: Make 'minSeq' non-optional once the new snapshot format becomes the default?
				//       (See https://github.com/microsoft/FluidFramework/issues/84)
				/* minSeq: */ chunk.headerMetadata.minSequenceNumber ??
					chunk.headerMetadata.sequenceNumber,
				/* currentSeq: */ chunk.headerMetadata.sequenceNumber,
			);
		}

		return chunk;
	}

	private async loadBody(
		chunk1: MergeTreeChunkV1,
		services: IChannelStorageService,
	): Promise<void> {
		const headerMetadata = chunk1.headerMetadata!;
		assert(chunk1.length <= headerMetadata.totalLength, 0x061 /* "Mismatch in totalLength" */);

		assert(
			chunk1.segmentCount <= headerMetadata.totalSegmentCount,
			0x062 /* "Mismatch in totalSegmentCount" */,
		);

		if (chunk1.segmentCount === headerMetadata.totalSegmentCount) {
			return;
		}

		let chunksWithAttribution = chunk1.attribution === undefined ? 0 : 1;
		const segs: SegmentWithInfo<IHasInsertionInfo>[] = [];
		let lengthSofar = chunk1.length;
		for (
			let chunkIndex = 1;
			chunkIndex < headerMetadata.orderedChunkMetadata.length;
			chunkIndex++
		) {
			const chunk = await SnapshotV1.loadChunk(
				services,
				headerMetadata.orderedChunkMetadata[chunkIndex].id,
				this.logger,
				this.mergeTree.options,
				this.serializer,
			);
			lengthSofar += chunk.length;
			// Deserialize each chunk segment and append it to the end of the MergeTree.
			const newSegs = chunk.segments.map((element) => this.specToSegment(element));
			this.extractAttribution(newSegs, chunk);
			chunksWithAttribution += chunk.attribution === undefined ? 0 : 1;
			segs.push(...newSegs);
		}

		assert(
			chunksWithAttribution === 0 ||
				chunksWithAttribution === headerMetadata.orderedChunkMetadata.length,
			0x4c0 /* all or no chunks should have attribution information */,
		);

		assert(lengthSofar === headerMetadata.totalLength, 0x063 /* "Mismatch in totalLength" */);

		assert(
			chunk1.segmentCount + segs.length === headerMetadata.totalSegmentCount,
			0x064 /* "Mismatch in totalSegmentCount" */,
		);

		// Helper to insert segments at the end of the MergeTree.
		const mergeTree = this.mergeTree;
		const append = (segments: ISegmentPrivate[], clientId: number, seq: number): void => {
			mergeTree.insertSegments(
				mergeTree.root.cachedLength ?? 0,
				segments,
				new PriorPerspective(UniversalSequenceNumber, clientId),
				{ seq, clientId },
				undefined,
			);
		};

		// Helpers to batch-insert segments that are below the min seq
		const batch: SegmentWithInfo<IHasInsertionInfo>[] = [];
		const flushBatch = (): void => {
			if (batch.length > 0) {
				append(batch, NonCollabClient, UniversalSequenceNumber);
			}
		};

		for (const seg of segs) {
			const { clientId, seq } = seg.insert;
			// If the segment can be batch inserted, add it to the 'batch' array.  Otherwise, flush
			// any batched segments and then insert the current segment individually.
			if (clientId === NonCollabClient && seq === UniversalSequenceNumber) {
				batch.push(seg);
			} else {
				flushBatch();
				append([seg], clientId, seq);
			}
		}

		flushBatch();
	}

	private extractAttribution(segments: ISegmentPrivate[], chunk: MergeTreeChunkV1): void {
		if (chunk.attribution) {
			const { attributionPolicy } = this.mergeTree;
			if (attributionPolicy === undefined) {
				throw new UsageError(
					"Attribution policy must be provided when loading a document with attribution information.",
				);
			}

			const { isAttached, attach, serializer } = attributionPolicy;
			if (!isAttached) {
				attach(this.client);
			}
			serializer.populateAttributionCollections(segments, chunk.attribution);
		} else {
			const { attributionPolicy } = this.mergeTree;
			if (attributionPolicy?.isAttached) {
				attributionPolicy?.detach();
			}
		}
	}

	/**
	 * If loading from a snapshot, get the catchup messages.
	 * @param rawMessages - The messages in original encoding
	 * @returns The decoded messages with parsed+hydrated handles.  Matches the format that will be passed in
	 * SharedObject.processCore.
	 */
	private async loadCatchupOps(
		rawMessages: Promise<ArrayBufferLike>,
		serializer: IFluidSerializer,
	): Promise<ISequencedDocumentMessage[]> {
		return serializer.parse(
			bufferToString(await rawMessages, "utf8"),
		) as ISequencedDocumentMessage[];
	}
}
