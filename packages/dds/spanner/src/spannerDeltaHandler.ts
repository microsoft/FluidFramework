/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";

/**
 * Handles incoming and outgoing deltas/ops for the Spanner distributed data structure.
 *
 * Since the handler will swap, that means the state of the underlying SpannerDeltaHandler will change. Not sure what
 * effect that will have on the runtime.
 *
 * This serves as an adapter to the real DeltaHandler, so that we can swap DeltaHandlers on the fly.
 *
 * Needs to be able to process v1 and v2 ops
 */
export class SpannerDeltaHandler implements IDeltaHandler {
	private newHandler: IDeltaHandler | undefined;
	public constructor(
		private readonly oldHandler: IDeltaHandler,
		// This is a hack, maybe parent handler would be better
		public readonly migrateFunction: (
			message: ISequencedDocumentMessage,
			local: boolean,
			localOpMetadata: unknown,
		) => boolean,
	) {}
	private get handler(): IDeltaHandler {
		return this.newHandler ?? this.oldHandler;
	}

	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// This allows us to process the migrate op and prevent the shared object from processing the wrong ops
		if (this.migrateFunction(message, local, localOpMetadata)) {
			return;
		}
		// Check for migration and v1 vs v2 ops here
		return this.handler.process(message, local, localOpMetadata);
	}

	// No idea whether any of the below 4 methods work as expected
	public setConnectionState(connected: boolean): void {
		return this.handler.setConnectionState(connected);
	}
	public reSubmit(message: never, localOpMetadata: unknown): void {
		return this.handler.reSubmit(message, localOpMetadata);
	}
	public applyStashedOp(message: never): unknown {
		return this.handler.applyStashedOp(message);
	}
	public rollback?(message: never, localOpMetadata: unknown): void {
		return this.handler.rollback?.(message, localOpMetadata);
	}

	// Allow for the handler to be swapped out for the new SharedObject's handler
	// This is rather primitive for a solution as we might want the old handler to be able to process ops v1 ops after
	// the swap.
	// Maybe a better name for this function is swapHandlers?
	public attach(handler: IDeltaHandler): void {
		// An assert here potentially to prevent the handler from being swapped out twice
		// Maybe we want rollback, so maybe not an assert. Not sure.
		assert(this.newHandler === undefined, "Can only swap handlers once");
		this.newHandler = handler;
	}
}
