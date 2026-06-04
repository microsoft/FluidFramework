/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerStorageService } from "@fluidframework/container-definitions/internal";
import { Deferred, PromiseCache, assert } from "@fluidframework/core-utils/internal";
import type {
	ISequencedDocumentMessage,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import {
	DataProcessingError,
	PerformanceEvent,
	type ITelemetryGenericEventExt,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

/**
 * Subset of the runtime's delta manager that the fetcher reads to coordinate
 * snapshot timing.
 */
interface IDeltaManagerReader {
	readonly initialSequenceNumber: number;
	readonly lastSequenceNumber: number;
	readonly inbound: { readonly paused: boolean };
	on(event: "op", listener: (message: ISequencedDocumentMessage) => void): unknown;
}

/**
 * Caches per-loading-group snapshots and waits for the delta manager to
 * catch up if the fetched snapshot is ahead of the runtime's current
 * sequence number. Extracted from ContainerRuntime so the runtime stays
 * focused on the live runtime pipeline.
 *
 * @internal
 */
export class LoadingGroupSnapshotFetcher {
	private readonly cache = new PromiseCache<string, ISnapshot>({
		expiry: { policy: "absolute", durationMs: 5 * 60 * 1000 },
	});

	constructor(
		private readonly getStorage: () => IContainerStorageService,
		private readonly deltaManager: IDeltaManagerReader,
		private readonly logger: ITelemetryLoggerExt,
		private readonly hasIsolatedChannels: () => boolean,
		private readonly isSummarizerClient: () => boolean,
	) {}

	/**
	 * Fetch (or read from cache) the snapshot tree for the given loadingGroupIds.
	 * If the fetched snapshot is ahead of the current local sequence number,
	 * wait for inbound ops to catch up before returning.
	 *
	 * @returns the requested subtree under `pathParts` and its sequence number.
	 */
	public async fetch(
		loadingGroupIds: string[],
		pathParts: string[],
	): Promise<{ snapshotTree: ISnapshotTree; sequenceNumber: number }> {
		const storage = this.getStorage();
		const sortedLoadingGroupIds = loadingGroupIds.sort();
		assert(
			storage.getSnapshot !== undefined,
			0x8ed /* getSnapshot api should be defined if used */,
		);
		let loadedFromCache = true;
		const snapshot = await this.cache.addOrGet(sortedLoadingGroupIds.join(","), async () => {
			assert(
				storage.getSnapshot !== undefined,
				0x8ee /* getSnapshot api should be defined if used */,
			);
			loadedFromCache = false;
			return storage.getSnapshot({
				cacheSnapshot: false,
				scenarioName: "snapshotForLoadingGroupId",
				loadingGroupIds: sortedLoadingGroupIds,
			});
		});

		this.logger.sendTelemetryEvent({
			eventName: "GroupIdSnapshotFetched",
			details: JSON.stringify({
				fromCache: loadedFromCache,
				loadingGroupIds: loadingGroupIds.join(","),
			}),
		});

		const snapshotTreeForPath = this.getSnapshotTreeForPath(snapshot.snapshotTree, pathParts);
		assert(snapshotTreeForPath !== undefined, 0x8ef /* no snapshotTree for the path */);
		const snapshotSeqNumber = snapshot.sequenceNumber;
		assert(snapshotSeqNumber !== undefined, 0x8f0 /* snapshotSeqNumber should be present */);

		// Older snapshot than the one we loaded from indicates a service issue.
		if (snapshotSeqNumber < this.deltaManager.initialSequenceNumber) {
			throw DataProcessingError.create(
				"Downloaded snapshot older than snapshot we loaded from",
				"getSnapshotForLoadingGroupId",
				undefined,
				{
					loadingGroupIds: sortedLoadingGroupIds.join(","),
					snapshotSeqNumber,
					initialSequenceNumber: this.deltaManager.initialSequenceNumber,
				},
			);
		}

		// If snapshot is ahead, catch up before returning.
		if (snapshotSeqNumber > this.deltaManager.lastSequenceNumber) {
			if (this.isSummarizerClient()) {
				throw new Error("Summarizer client behind, loaded newer snapshot with loadingGroupId");
			}

			const props: ITelemetryGenericEventExt = {
				eventName: "GroupIdSnapshotCatchup",
				loadingGroupIds: sortedLoadingGroupIds.join(","),
				targetSequenceNumber: snapshotSeqNumber,
				sequenceNumber: this.deltaManager.lastSequenceNumber,
			};

			const event = PerformanceEvent.start(this.logger, { ...props });
			if (this.deltaManager.inbound.paused) {
				props.inboundPaused = this.deltaManager.inbound.paused;
			}
			const defP = new Deferred<boolean>();
			this.deltaManager.on("op", (message: ISequencedDocumentMessage) => {
				if (message.sequenceNumber >= snapshotSeqNumber) {
					defP.resolve(true);
				}
			});
			await defP.promise;
			event.end(props);
		}
		return { snapshotTree: snapshotTreeForPath, sequenceNumber: snapshotSeqNumber };
	}

	private getSnapshotTreeForPath(
		snapshotTree: ISnapshotTree,
		pathParts: string[],
	): ISnapshotTree | undefined {
		const isolated = this.hasIsolatedChannels();
		let childTree = snapshotTree;
		for (const part of pathParts) {
			if (isolated) {
				childTree = childTree?.trees[channelsTreeName];
			}
			childTree = childTree?.trees[part];
		}
		return childTree;
	}
}
