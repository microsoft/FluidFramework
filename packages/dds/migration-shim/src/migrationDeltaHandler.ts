/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { type IShimDeltaHandler } from "./types.js";

/**
 * Handles incoming and outgoing deltas/ops for the Migration Shim distributed data structure.
 * Intercepts processing of ops to allow for migration, and swapping from LegacySharedTree to new SharedTree
 *
 * TODO: Needs to be able to process v1 and v2 ops, differentiate between them, understand the various states
 * and drop v1 ops after migration. After the MSN of the barrier op, it needs to process v2 ops without needing to
 * check for the v2 stamp.
 */
export class MigrationShimDeltaHandler implements IShimDeltaHandler {
	private legacyTreeHandler?: IDeltaHandler;
	private newTreeHandler?: IDeltaHandler;
	public constructor(
		// Maybe it would be better to pass in a different interface?
		public readonly processMigrateOp: (
			message: ISequencedDocumentMessage,
			local: boolean,
			localOpMetadata: unknown,
		) => boolean,
	) {}
	// Note: we may only need to stamp v2 ops as v1 ops can be considered non-stamped ops.

	// Introduction of invariant, we always expect an old handler.
	public hasTreeDeltaHandler(): boolean {
		return this.legacyTreeHandler !== undefined;
	}

	private get treeDeltaHandler(): IDeltaHandler {
		const handler = this.newTreeHandler ?? this.legacyTreeHandler;
		assert(handler !== undefined, "No handler to process op");
		return handler;
	}

	public isPreAttachState(): boolean {
		return this.legacyTreeHandler === undefined && this.newTreeHandler === undefined;
	}

	public isUsingOldV1(): boolean {
		return this.legacyTreeHandler !== undefined && this.newTreeHandler === undefined;
	}

	public isUsingNewV2(): boolean {
		return this.legacyTreeHandler !== undefined && this.newTreeHandler !== undefined;
	}

	// Allow for the handler to be swapped out for the new SharedTree's handler
	public attachTreeDeltaHandler(treeDeltaHandler: IDeltaHandler): void {
		assert(!this.isUsingNewV2(), "Can't swap tree handlers more than once!");
		if (this.isPreAttachState()) {
			this.legacyTreeHandler = treeDeltaHandler;
			return;
		}
		assert(this.isUsingOldV1(), "Can only swap handlers after the old handler is loaded");
		this.newTreeHandler = treeDeltaHandler;
		assert(this.isUsingNewV2(), "Should be using new handler after swap");
	}

	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// This allows us to process the migrate op and prevent the shared object from processing the wrong ops
		// TODO: maybe call this preprocess shim op
		if (this.processMigrateOp(message, local, localOpMetadata)) {
			return;
		}
		// Another thought, flatten the IShimDeltaHandler and the MigrationShim into one class
		// TODO: drop extra migration ops and drop v1 ops after migration
		return this.treeDeltaHandler.process(message, local, localOpMetadata);
	}

	// No idea whether any of the below 4 methods work as expected
	public setConnectionState(connected: boolean): void {
		return this.treeDeltaHandler.setConnectionState(connected);
	}
	public reSubmit(message: unknown, localOpMetadata: unknown): void {
		// Blow up on V1 ops or drop them if new handler
		// Local state is potentially out of sync
		return this.treeDeltaHandler.reSubmit(message, localOpMetadata);
	}
	public applyStashedOp(message: unknown): unknown {
		// Blow up on V1 ops or drop them if new handler
		// Local state is potentially out of sync
		return this.treeDeltaHandler.applyStashedOp(message);
	}
	public rollback?(message: unknown, localOpMetadata: unknown): void {
		// Blow up on V1 ops or drop them if new handler
		// Local state is potentially out of sync
		return this.treeDeltaHandler.rollback?.(message, localOpMetadata);
	}
}
