/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	FetchSource,
	type IClient,
	type IDocumentDeltaConnection,
	type IDocumentDeltaStorageService,
	type IDocumentService,
	type IDocumentServiceEvents,
	type IDocumentServicePolicies,
	type IDocumentStorageService,
	type IResolvedUrl,
	type ISnapshot,
	type ISnapshotFetchOptions,
	type IVersion,
} from "@fluidframework/driver-definitions/internal";
import { DocumentStorageServiceProxy } from "@fluidframework/driver-utils/internal";

/**
 * Forces point-in-time snapshot reads to bypass caches while forwarding all other storage operations
 * to the selected historical document service.
 */
class PointInTimeDocumentStorageService extends DocumentStorageServiceProxy {
	public override async getSnapshot(
		snapshotFetchOptions?: ISnapshotFetchOptions,
	): Promise<ISnapshot> {
		return super.getSnapshot({
			...snapshotFetchOptions,
			fetchSource: FetchSource.noCache,
		});
	}

	public override async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null -- IDocumentStorageService is a legacy API that requires null.
		versionId: string | null,
		count: number,
		scenarioName?: string,
	): Promise<IVersion[]> {
		return super.getVersions(versionId, count, scenarioName, FetchSource.noCache);
	}
}

/**
 * A read-only document service that materializes a document at a target sequence number by combining
 * a recoverable snapshot with a bounded replay of live ops.
 *
 * @remarks
 * Storage (the snapshot) is served from the closest file version at or before the target sequence
 * number. The ops needed to advance from that snapshot to the target are read from the live
 * document's delta storage, bounded so that no op past the target is ever fetched.
 *
 * The service advertises the {@link IDocumentServicePolicies.storageOnly} policy. This reuses the
 * loader's "frozen" load mechanism: the connection manager synthesizes a read-only frozen delta
 * stream instead of opening a live socket, and forces the container read-only. The delta manager
 * still catches up from the snapshot's sequence number through delta storage, which is exactly the
 * bounded replay we want. As a result no live delta-stream connection is ever established.
 *
 * Op availability is enforced by the delta storage stack itself: it validates that fetched batches
 * are contiguous from the requested start, keeps requesting until the bounded range is fully
 * delivered, and fails the fetch if the ops never materialize. So a stream that completes has
 * necessarily served the whole bridge, and no additional checks are needed here.
 *
 * @internal
 */
export class OdspPointInTimeDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	public constructor(
		public readonly resolvedUrl: IResolvedUrl,
		// Serves the snapshot: a read-only document service bound to the closest file version at or
		// before the target sequence number. Its storage is the base we replay ops on top of.
		private readonly recoverableDocumentService: IDocumentService,
		private readonly liveDocumentService: IDocumentService,
		private readonly targetSequenceNumber: number,
	) {
		super();
		this.liveDocumentService.on("metadataUpdate", this.metadataUpdateHandler);
	}

	// storageOnly makes the connection manager synthesize a read-only frozen delta stream (no live
	// socket) and force the container read-only - see the class remarks.
	public readonly policies: IDocumentServicePolicies = { storageOnly: true };

	public dispose(): void {
		this.liveDocumentService.off("metadataUpdate", this.metadataUpdateHandler);
		this.recoverableDocumentService.dispose();
		this.liveDocumentService.dispose();
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		const storage = await this.recoverableDocumentService.connectToStorage();
		return new PointInTimeDocumentStorageService(storage);
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		const liveDeltaStorage = await this.liveDocumentService.connectToDeltaStorage();
		// The exclusive upper bound needed to include the target op itself.
		const boundedTo = this.targetSequenceNumber + 1;
		return {
			fetchMessages: (from, to, abortSignal, cachedOnly, fetchReason) =>
				liveDeltaStorage.fetchMessages(
					from,
					to === undefined ? boundedTo : Math.min(to, boundedTo),
					abortSignal,
					cachedOnly,
					fetchReason,
				),
		};
	}

	public async connectToDeltaStream(_client: IClient): Promise<IDocumentDeltaConnection> {
		// Unreachable under normal flow: the connection manager short-circuits on the storageOnly
		// policy and synthesizes a frozen delta stream before ever calling connectToDeltaStream.
		// Reaching here indicates a regression of that short-circuit.
		throw new Error(
			"OdspPointInTimeDocumentService is storage-only; connectToDeltaStream should not be called",
		);
	}

	private readonly metadataUpdateHandler = (metadata: Record<string, string>): void => {
		this.emit("metadataUpdate", metadata);
	};
}
