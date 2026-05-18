/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Trace } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	IIdCompressor,
	IIdCompressorCore,
	IdCreationRange,
} from "@fluidframework/id-compressor/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { addBlobToSummary } from "@fluidframework/runtime-utils/internal";
import {
	PerformanceEvent,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	ContainerMessageType,
	type ContainerRuntimeIdAllocationMessage,
} from "./messageTypes.js";
import type { LocalBatchMessage } from "./opLifecycle/index.js";
import type {
	InboundRuntimeMessageFor,
	IRuntimeFeature,
	RuntimeMessagesContentFor,
} from "./runtimeFeature.js";

const idCompressorBlobName = ".idCompressor";

/**
 * Owns the entire IdCompressor lifecycle: lazy load, pending range queue
 * that builds up before delayed initialization, IdAllocation message routing
 * (handleOp / applyStashedOp / reSubmitOp), summary contribution, and the
 * outbound LocalBatchMessage shape used by Outbox.
 *
 * Removes ~5 fields and 3 methods from ContainerRuntime.
 *
 * @internal
 */
export class IdCompressorFeature
	implements IRuntimeFeature<ContainerMessageType.IdAllocation>
{
	private _compressor: (IIdCompressor & IIdCompressorCore) | undefined;

	/**
	 * Ranges received while the compressor was off — only populated in
	 * "delayed" mode before {@link loadDelayed} fires.
	 */
	private pendingOps: IdCreationRange[] = [];

	constructor(
		private readonly createFn: () => IIdCompressor & IIdCompressorCore,
		private readonly idCompressorMode: () => "on" | "delayed" | undefined,
		private readonly skipSavedCompressorOps: boolean,
		private readonly logger: ITelemetryLoggerExt,
		private readonly getReferenceSequenceNumber: () => number,
	) {}

	/**
	 * Raw compressor reference. Returns `undefined` if the compressor has not
	 * been loaded yet (delayed mode pre-load).
	 */
	public get compressor(): (IIdCompressor & IIdCompressorCore) | undefined {
		return this._compressor;
	}

	/**
	 * The {@link @fluidframework/runtime-definitions#IContainerRuntimeBase.idCompressor}
	 * value. Exposed only when mode is "on" — in "delayed" mode callers should
	 * use {@link generateDocumentUniqueId} instead, since touching the
	 * compressor would force-load it in subsequent sessions.
	 */
	public get exposedCompressor(): (IIdCompressor & IIdCompressorCore) | undefined {
		if (this.idCompressorMode() === "on") {
			assert(this._compressor !== undefined, 0x8ea /* compressor should have been loaded */);
			return this._compressor;
		}
		return undefined;
	}

	public generateDocumentUniqueId(): string | number {
		return this._compressor?.generateDocumentUniqueId() ?? uuid();
	}

	/**
	 * Eager load triggered during initial runtime setup when mode is "on", or
	 * "delayed" + already connected.
	 */
	public loadOnBoot(): void {
		if (this._compressor !== undefined) {
			return;
		}
		PerformanceEvent.timedExec(
			this.logger,
			{ eventName: "CreateIdCompressorOnBoot" },
			(event) => {
				this._compressor = this.createFn();
				event.end({
					details: {
						idCompressorMode: this.idCompressorMode(),
					},
				});
			},
		);
	}

	/**
	 * Lazy load for "delayed" mode — finalizes any ranges that piled up in
	 * {@link pendingOps} while the compressor was off.
	 *
	 * @remarks Only safe for `off → delayed` schema transitions. Any other
	 * schema transition that would turn the compressor on requires synchronous
	 * ID-compressor initialization and must not call this. The decision point
	 * lives in `containerRuntime.onSchemaChange` (see PR #20174).
	 */
	public loadDelayed(): void {
		if (this._compressor !== undefined) {
			return;
		}
		if (this.idCompressorMode() === undefined) {
			return;
		}
		PerformanceEvent.timedExec(
			this.logger,
			{ eventName: "CreateIdCompressorOnDelayedLoad" },
			(event) => {
				this._compressor = this.createFn();
				const ops = this.pendingOps;
				this.pendingOps = [];
				const trace = Trace.start();
				for (const range of ops) {
					this._compressor.finalizeCreationRange(range);
				}
				event.end({
					details: {
						finalizeCreationRangeDuration: trace.trace().duration,
						idCompressorMode: this.idCompressorMode(),
						pendingIdCompressorOps: ops.length,
					},
				});
			},
		);
		assert(this.pendingOps.length === 0, 0x976 /* No new ops added */);
	}

	/**
	 * Build a {@link LocalBatchMessage} carrying the next pending creation
	 * range, or `undefined` if there is nothing to allocate.
	 */
	public generateAllocationOp(): LocalBatchMessage | undefined {
		if (this._compressor === undefined) {
			return undefined;
		}
		const idRange = this._compressor.takeNextCreationRange();
		if (idRange.ids === undefined) {
			return undefined;
		}
		const idAllocationMessage: ContainerRuntimeIdAllocationMessage = {
			type: ContainerMessageType.IdAllocation,
			contents: idRange,
		};
		return {
			runtimeOp: idAllocationMessage,
			referenceSequenceNumber: this.getReferenceSequenceNumber(),
			staged: false,
		};
	}

	public contributeSummary(summaryTree: ISummaryTreeWithStats): void {
		if (this._compressor !== undefined) {
			addBlobToSummary(
				summaryTree,
				idCompressorBlobName,
				JSON.stringify(this._compressor.serialize(false)),
			);
		}
	}

	public readonly supportedOps = [ContainerMessageType.IdAllocation] as const;

	public handleOp(
		_message: InboundRuntimeMessageFor<ContainerMessageType.IdAllocation>,
		messagesContent: RuntimeMessagesContentFor<ContainerMessageType.IdAllocation>[],
		_local: boolean,
		savedOp?: boolean,
	): void {
		for (const c of messagesContent) {
			this.processSingleRange(c.contents, savedOp);
		}
	}

	private processSingleRange(range: IdCreationRange, savedOp?: boolean): void {
		// Don't re-finalize the range if we're processing a "savedOp" in stashed
		// ops flow — the compressor is stashed with these ops already processed.
		// In "delayed" mode the compressor may not have been serialized, so we
		// must process all ops.
		if (this.skipSavedCompressorOps && savedOp === true) {
			return;
		}
		if (this._compressor === undefined) {
			// Some other client turned on the compressor. Queue until we load.
			assert(
				this.idCompressorMode() !== undefined,
				0x93c /* id compressor should be enabled */,
			);
			this.pendingOps.push(range);
		} else {
			assert(this.pendingOps.length === 0, 0x979 /* there should be no pending ops! */);
			this._compressor.finalizeCreationRange(range);
		}
	}

	public applyStashedOp(): { result: unknown } {
		// IdAllocation ops in stashed state are ignored — the compressor's tip
		// state was serialized into the pending state.
		assert(this.idCompressorMode() !== undefined, 0x8f1 /* ID compressor should be in use */);
		return { result: undefined };
	}

	public reSubmitOp(): void {
		// Allocation ops are never resubmitted/rebased — the runtime submits a
		// fresh range covering all pending IDs before replay.
	}
}
