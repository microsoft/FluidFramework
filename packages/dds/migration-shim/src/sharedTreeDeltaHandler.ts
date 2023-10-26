/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IShimDeltaHandler } from "./types.js";

/**
 * Handles incoming and outgoing deltas/ops for the SharedTreeShim distributed data structure.
 * This serves as an adapter to the real DeltaHandler, filter/process migration ops
 *
 * This should just have the ability to drop v1 & migrate ops, and process v2 ops. There may be an opportunity to
 * combine this class with the MigrationShimDeltaHandler, but for now the classes are separated. Once it is clear what
 * exact code can be shared between the two classes is and how it can be merge, we may figure out a way of merging
 * MigrationShimDeltaHandler and SharedTreeShimDeltaHandler.
 */
export class SharedTreeShimDeltaHandler implements IShimDeltaHandler {
	private _handler?: IDeltaHandler;
	private get handler(): IDeltaHandler {
		const handler = this._handler;
		assert(handler !== undefined, "No handler to process op");
		return handler;
	}

	public attachTreeDeltaHandler(handler: IDeltaHandler): void {
		assert(this._handler === undefined, "Should only be able to connect once!");
		this._handler = handler;
	}

	public hasTreeDeltaHandler(): boolean {
		return this._handler !== undefined;
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

	// Resubmitting v1 ops should fail. We should not be resubmitting v1 ops.
	public reSubmit(message: unknown, localOpMetadata: unknown): void {
		return this.handler.reSubmit(message, localOpMetadata);
	}

	// We are not capable of applying stashed v1 ops.
	public applyStashedOp(message: unknown): unknown {
		return this.handler.applyStashedOp(message);
	}

	// We cannot rollback v1 ops.
	public rollback?(message: unknown, localOpMetadata: unknown): void {
		return this.handler.rollback?.(message, localOpMetadata);
	}
}
