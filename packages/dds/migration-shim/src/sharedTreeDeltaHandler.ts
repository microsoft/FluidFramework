/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IShimDeltaHandler } from "./types";

/**
 * Handles incoming and outgoing deltas/ops for the SharedTreeShim distributed data structure.
 * This serves as an adapter to the real DeltaHandler, filter/process migration ops
 *
 * TODO: Needs to be able to process v1 and v2 ops, differentiate between them, understand the various states
 * and drop v1 ops after migration. After the MSN of the barrier op, it needs to process v2 ops without needing to
 * check for the v2 stamp.
 */
export class SharedTreeShimDeltaHandler implements IShimDeltaHandler {
	private _handler?: IDeltaHandler;
	private get handler(): IDeltaHandler {
		const handler = this._handler;
		assert(handler !== undefined, "No handler to process op");
		return handler;
	}

	public attach(handler: IDeltaHandler): void {
		assert(this._handler === undefined, "Should only be able to connect once!");
		this._handler = handler;
	}

	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// This allows us to process the migrate op and prevent the shared object from processing the wrong ops
		// TODO: drop migrate ops and drop v1 ops
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
