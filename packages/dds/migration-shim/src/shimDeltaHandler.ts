/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { type IShimDeltaHandler } from "./types";

// This may be duplicate, and can be removed in subsequent PRs.
enum MigrationState {
	NotStarted,
	Completed,
	ShouldNotMigrate,
}

/**
 * Handles incoming and outgoing deltas/ops for all Shims
 * Intercepts processing of ops to allow for migration, and swapping from LegacySharedTree to new SharedTree
 * Knows to only drop migration ops and v1 ops when loaded after the summary has been updated to the new SharedTree
 */
export class ShimDeltaHandler implements IShimDeltaHandler {
	private oldHandler?: IDeltaHandler;
	private newHandler?: IDeltaHandler;
	public constructor(
		// This is a hack, maybe parent handler would be better
		public readonly processMigrateOp: (
			message: ISequencedDocumentMessage,
			local: boolean,
			localOpMetadata: unknown,
		) => boolean,
		private migrateState: MigrationState,
	) {}
	private get handler(): IDeltaHandler {
		if (this.migrateState === MigrationState.ShouldNotMigrate) {
			assert(
				this.oldHandler !== undefined,
				"Should have old handler if migration is not allowed",
			);
			return this.oldHandler;
		}
		const handler = this.newHandler ?? this.oldHandler;
		assert(handler !== undefined, "No handler to process op");
		return handler;
	}

	public isPreAttachState(): boolean {
		assert(
			this.migrateState !== MigrationState.Completed,
			"Should never be in pre attach state if migration is completed",
		);
		return this.oldHandler === undefined && this.newHandler === undefined;
	}

	public isUsingOldV1(): boolean {
		assert(
			this.migrateState !== MigrationState.Completed,
			"Should never be in using V1 state if migration is completed",
		);
		return this.oldHandler !== undefined && this.newHandler === undefined;
	}

	public isUsingNewV2(): boolean {
		assert(
			this.migrateState !== MigrationState.ShouldNotMigrate,
			"Should never be in using V2 state if migration is not allowed",
		);
		return this.oldHandler !== undefined && this.newHandler !== undefined;
	}

	// Allow for the handler to be swapped out for the new SharedTree's handler
	public attach(handler: IDeltaHandler): void {
		if (this.isPreAttachState()) {
			this.oldHandler = handler;
			return;
		}
		assert(
			this.isUsingOldV1() && this.migrateState === MigrationState.NotStarted,
			"Can only swap handlers after the old handler is loaded and is in Not Started State",
		);
		this.newHandler = handler;
		this.migrateState = MigrationState.Completed;
		assert(this.isUsingNewV2(), "Should be using new handler after swap");
	}

	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// This allows us to process the migrate op and prevent the shared object from processing the wrong ops
		if (
			this.migrateState === MigrationState.NotStarted &&
			this.processMigrateOp(message, local, localOpMetadata)
		) {
			return;
		}
		if (
			this.migrateState === MigrationState.Completed ||
			this.migrateState === MigrationState.ShouldNotMigrate
			// && Is migrate op or v1 op
		) {
			// TODO: drop extra migration ops and drop v1 ops after migration
		}
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
