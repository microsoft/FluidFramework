/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";

/**
 * Handles incoming and outgoing deltas/ops for the Spanner distributed data structure.
 * This serves as an adapter to the real DeltaHandler, so that we can swap DeltaHandlers on the fly.
 *
 * TODO: Needs to be able to process v1 and v2 ops, differentiate between them, understand the various states
 * and drop v1 ops after migration. After the MSN of the barrier op, it needs to process v2 ops without needing to
 * check for the v2 stamp.
 */
export class SpannerDeltaHandler implements IDeltaHandler {
	private oldHandler?: IDeltaHandler;
	private newHandler?: IDeltaHandler;
	public constructor(
		// This is a hack, maybe parent handler would be better
		public readonly processMigrateOp: (
			message: ISequencedDocumentMessage,
			local: boolean,
			localOpMetadata: unknown,
		) => boolean,
	) {}
	private get handler(): IDeltaHandler {
		const handler = this.newHandler ?? this.oldHandler;
		assert(handler !== undefined, "No handler to process op");
		return handler;
	}

	public isPreAttachState(): boolean {
		return this.oldHandler === undefined && this.newHandler === undefined;
	}

	public isUsingOldV1(): boolean {
		return this.oldHandler !== undefined && this.newHandler === undefined;
	}

	public isUsingNewV2(): boolean {
		return this.oldHandler !== undefined && this.newHandler !== undefined;
	}

	public load(oldHandler: IDeltaHandler): void {
		assert(this.isPreAttachState(), "Should not have loaded any handlers!");
		this.oldHandler = oldHandler;
	}

	// Allow for the handler to be swapped out for the new SharedObject's handler
	// This is rather primitive for a solution as we might want the old handler to be able to process ops v1 ops after
	// the swap.
	// Maybe a better name for this function is swapHandlers?
	public reconnect(handler: IDeltaHandler): void {
		// An assert here potentially to prevent the handler from being swapped out twice
		// Maybe we want rollback, so maybe not an assert. Not sure.
		assert(this.isUsingOldV1(), "Can only swap handlers after the old handler is loaded");
		this.newHandler = handler;
	}

	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// This allows us to process the migrate op and prevent the shared object from processing the wrong ops
		if (this.processMigrateOp(message, local, localOpMetadata)) {
			return;
		}
		// Check for migration and v1 vs v2 ops here
		return this.handler.process(message, local, localOpMetadata);
	}

	// No idea whether any of the below 4 methods work as expected
	public setConnectionState(connected: boolean): void {
		return this.handler.setConnectionState(connected);
	}
	public reSubmit(message: unknown, localOpMetadata: unknown): void {
		// Blow up on V1 ops if new handler
		return this.handler.reSubmit(message, localOpMetadata);
	}
	public applyStashedOp(message: unknown): unknown {
		// Blow up on V1 ops if new handler
		return this.handler.applyStashedOp(message);
	}
	public rollback?(message: unknown, localOpMetadata: unknown): void {
		// Blow up on V1 ops if new handler
		return this.handler.rollback?.(message, localOpMetadata);
	}
}
