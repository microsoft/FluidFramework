/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { NonRetryableError, RetryableError } from "@fluidframework/driver-utils/internal";
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
 * Op availability is validated lazily, as the loader reads the bridge ops from delta storage
 * ({@link OdspPointInTimeDocumentService.connectToDeltaStorage}). A missing low end (ops trimmed by
 * retention) is a permanent, non-retryable failure; a missing high end (the target's ops sequenced
 * but not yet flushed to delta storage) is transient and retryable, so a load requested right after
 * a change settles once the ops land.
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
				// The two ways it can be incomplete are fundamentally different failures, so they are
				// reported with different retryability (see the throws below).
				const opsNeeded = from < bounded;
				let firstSeq: number | undefined;
				let maxSeq = from - 1;
				return {
					read: async () => {
						const result = await inner.read();
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
							abortSignal?.aborted !== true
						) {
							// Bottom missing: the bridge's lowest op (`from`) is no longer served, so delta
							// storage starts above it (`firstSeq > from`). Retention trimmed those ops off
							// the oldest end - they are permanently gone and no retry can recover them.
							if (firstSeq !== undefined && firstSeq > from) {
								throw new NonRetryableError(
									`Cannot materialize sequence number ${targetSequenceNumber}: the ops needed to ` +
										`replay the base snapshot were trimmed by op retention. Required ops from ` +
										`${from} but delta storage's oldest served op is ${firstSeq}.`,
									OdspErrorTypes.cannotCatchUp,
									{ driverVersion },
								);
							}
							// Top not reached: the low end is intact but the stream stopped before the
							// target's op (`bounded - 1`). This is transient - those ops have been sequenced
							// on the live document but are not yet flushed to (or visible from) delta storage,
							// the common "load a version right after the change" race - so a retry can succeed
							// once they land. A target legitimately beyond the live tip lands here too and will
							// keep retrying until the loader's own bounds give up.
							if (maxSeq < bounded - 1) {
								throw new RetryableError(
									`Cannot yet materialize sequence number ${targetSequenceNumber}: delta storage ` +
										`has only caught up to ${maxSeq} of the required ops [${from}, ${bounded - 1}]. ` +
										`The remaining ops are sequenced but not yet flushed to delta storage; retrying.`,
									OdspErrorTypes.cannotCatchUp,
									{ driverVersion },
								);
							}
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
