/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { type IShimDeltaHandler } from "./types";

/**
 * Handles incoming and outgoing deltas/ops for the Migration Shim distributed data structure.
 * Intercepts processing of ops to allow for migration, and swapping from LegacySharedTree to new SharedTree
 *
 * TODO: Needs to be able to process v1 and v2 ops, differentiate between them, understand the various states
 * and drop v1 ops after migration. After the MSN of the barrier op, it needs to process v2 ops without needing to
 * check for the v2 stamp.
 */
export class MigrationShimDeltaHandler implements IShimDeltaHandler {
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

	// Allow for the handler to be swapped out for the new SharedTree's handler
	public attach(handler: IDeltaHandler): void {
		assert(!this.isUsingNewV2(), "Can't swap tree handlers more than once!");
		if (this.isPreAttachState()) {
			this.oldHandler = handler;
			return;
		}
		assert(this.isUsingOldV1(), "Can only swap handlers after the old handler is loaded");
		this.newHandler = handler;
		assert(this.isUsingNewV2(), "Should be using new handler after swap");
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
		// TODO: drop extra migration ops and drop v1 ops after migration
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
