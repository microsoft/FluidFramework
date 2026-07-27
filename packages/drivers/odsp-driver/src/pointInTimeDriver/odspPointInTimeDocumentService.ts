/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { NonRetryableError, canRetryOnError } from "@fluidframework/driver-utils/internal";
import type {
	IClient,
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServicePolicies,
	IDocumentStorageService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

import { pkgVersion as driverVersion } from "../packageVersion.js";

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
		return this.recoverableDocumentService.connectToStorage();
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		const liveDeltaStorage = await this.liveDocumentService.connectToDeltaStorage();
		// The exclusive upper bound needed to include the target op itself.
		const boundedTo = this.targetSequenceNumber + 1;
		const targetSequenceNumber = this.targetSequenceNumber;
		return {
			fetchMessages: (from, to, abortSignal, cachedOnly, fetchReason) => {
				const bounded = to === undefined ? boundedTo : Math.min(to, boundedTo);
				const inner = liveDeltaStorage.fetchMessages(
					from,
					bounded,
					abortSignal,
					cachedOnly,
					fetchReason,
				);
				// Validate op availability by observing the ops the loader actually reads, rather than
				// a separate up-front walk. The live delta storage already merges the creation
				// snapshot's ops, so this sees exactly the ops a replay can apply.
				//
				// Op retention trims a contiguous prefix from the oldest end, and Fluid op sequence
				// numbers are contiguous by construction, so the bridge [from, bounded) is intact iff
				// its lowest op (`from`) is still served and the stream reaches its top (`bounded - 1`).
				const opsNeeded = from < bounded;
				let firstSeq: number | undefined;
				let maxSeq = from - 1;
				return {
					read: async () => {
						let result: Awaited<ReturnType<typeof inner.read>>;
						try {
							result = await inner.read();
						} catch (error) {
							// The bridging ops could not be retrieved. The op-fetch layer exhausts its
							// retries and throws a non-retryable generic network error when the required
							// ops never materialize - e.g. they were trimmed by op retention, or the target
							// is beyond the live document's tip so those sequence numbers never existed.
							// Surface the driver's canonical, non-retryable op-availability error instead of
							// leaking a raw storage error. Retryable errors are left untouched so the delta
							// manager can retry, and other non-retryable error types (auth, throttling, etc.)
							// are preserved rather than masked as an op-availability failure.
							if (
								opsNeeded &&
								cachedOnly !== true &&
								abortSignal?.aborted !== true &&
								!canRetryOnError(error) &&
								(error as { errorType?: unknown })?.errorType ===
									OdspErrorTypes.genericNetworkError
							) {
								throw new NonRetryableError(
									`Cannot materialize sequence number ${targetSequenceNumber}: the ops needed ` +
										`to replay the base snapshot could not be retrieved from delta storage ` +
										`(required [${from}, ${bounded - 1}]; trimmed by op retention or target ` +
										`beyond the live document's tip).`,
									OdspErrorTypes.cannotCatchUp,
									{ driverVersion },
								);
							}
							throw error;
						}
						if (!result.done && result.value.length > 0) {
							firstSeq ??= result.value[0].sequenceNumber;
							maxSeq = result.value[result.value.length - 1].sequenceNumber;
						}
						// Only enforce on a complete, non-cached, non-aborted pass: a cachedOnly pass
						// legitimately ends short (it only drains local cache), and an abort is not a
						// retention failure.
						if (
							result.done &&
							opsNeeded &&
							cachedOnly !== true &&
							abortSignal?.aborted !== true &&
							(firstSeq !== from || maxSeq < bounded - 1)
						) {
							throw new NonRetryableError(
								`Cannot materialize sequence number ${targetSequenceNumber}: the ops needed to ` +
									`replay the base snapshot are unavailable. Required ops [${from}, ${bounded - 1}] ` +
									`but delta storage served [${firstSeq ?? "none"}, ${maxSeq}] (trimmed by op ` +
									`retention or target beyond the live document's tip).`,
								OdspErrorTypes.cannotCatchUp,
								{ driverVersion },
							);
						}
						return result;
					},
				};
			},
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
