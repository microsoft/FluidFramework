/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils/internal';
import { type IChannelAttributes, type IDeltaHandler } from '@fluidframework/datastore-definitions/internal';
import { type ISequencedDocumentMessage } from '@fluidframework/driver-definitions';
import { MessageType } from '@fluidframework/driver-definitions/internal';

import { type IOpContents, type IShimDeltaHandler } from './types.js';
import { attributesMatch, isBarrierOp, isStampedOp } from './utils.js';

/**
 * Handles incoming and outgoing deltas/ops for the Migration Shim distributed data structure.
 * Intercepts processing of ops to allow for migration, and swapping from LegacySharedTree to new SharedTree
 *
 * Able to process v1 and v2 ops, differentiate between them, understand the various states and drop v1 ops after
 * migration.
 *
 * TODO: After the MSN of the barrier op, it needs to process v2 ops without needing to check for the v2 stamp.
 */
export class MigrationShimDeltaHandler implements IShimDeltaHandler {
	private legacyTreeHandler?: IDeltaHandler;
	private newTreeHandler?: IDeltaHandler;
	public constructor(
		// Maybe it would be better to pass in a different interface?
		public readonly processMigrateOp: (
			message: ISequencedDocumentMessage,
			local: boolean,
			localOpMetadata: unknown
		) => boolean,
		private readonly submitLocalMessage: (message: IOpContents) => void,
		private readonly attributes: IChannelAttributes
	) {}
	// Introduction of invariant, we always expect an old handler.
	public hasTreeDeltaHandler(): boolean {
		return this.legacyTreeHandler !== undefined;
	}

	private get treeDeltaHandler(): IDeltaHandler {
		const handler = this.newTreeHandler ?? this.legacyTreeHandler;
		assert(handler !== undefined, 0x7e2 /* No handler to process op */);
		return handler;
	}

	private _attached = false;
	public get attached(): boolean {
		return this._attached;
	}

	public markAttached(): void {
		this._attached = true;
	}

	public isPreAttachState(): boolean {
		const preAttach = this.legacyTreeHandler === undefined && this.newTreeHandler === undefined;
		assert(!preAttach || !this.attached, 0x82a /* Should not be attached in preAttach state */);
		return preAttach;
	}

	public isUsingOldV1(): boolean {
		return this.legacyTreeHandler !== undefined && this.newTreeHandler === undefined;
	}

	public isUsingNewV2(): boolean {
		const isUsingV2 = this.legacyTreeHandler !== undefined && this.newTreeHandler !== undefined;
		assert(!isUsingV2 || this.attached, 0x82b /* Should be attached if in v2 state */);
		return isUsingV2;
	}

	// Allow for the handler to be swapped out for the new SharedTree's handler
	public attachTreeDeltaHandler(treeDeltaHandler: IDeltaHandler): void {
		assert(!this.isUsingNewV2(), 0x7e3 /* Can't swap tree handlers more than once! */);
		if (this.isPreAttachState()) {
			this.legacyTreeHandler = treeDeltaHandler;
			return;
		}
		assert(this.isUsingOldV1(), 0x7e4 /* Can only swap handlers after the old handler is loaded */);
		this.newTreeHandler = treeDeltaHandler;
		assert(this.isUsingNewV2(), 0x7e5 /* Should be using new handler after swap */);
	}

	public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
		// This allows us to process the migrate op and prevent the shared object from processing the wrong ops
		assert(!this.isPreAttachState(), 0x82c /* Can't process ops before attaching tree handler */);
		if (message.type !== MessageType.Operation) {
			return;
		}

		const contents = message.contents as IOpContents;
		if (this.isInV1StateAndIsBarrierOp(contents)) {
			this.processMigrateOp(message, local, localOpMetadata);
			return;
		}

		if (this.shouldDropOp(contents)) {
			return;
		}
		// Another thought, flatten the IShimDeltaHandler and the MigrationShim into one class
		return this.treeDeltaHandler.process(message, local, localOpMetadata);
	}

	public setConnectionState(connected: boolean): void {
		return this.treeDeltaHandler.setConnectionState(connected);
	}

	public reSubmit(contents: unknown, localOpMetadata: unknown): void {
		const opContents = contents as IOpContents;
		if (this.isInV1StateAndIsBarrierOp(opContents)) {
			this.submitLocalMessage(opContents);
			return;
		}

		if (this.shouldDropOp(opContents)) {
			return;
		}
		return this.treeDeltaHandler.reSubmit(contents, localOpMetadata);
	}

	public applyStashedOp(contents: unknown): void {
		const opContents = contents as IOpContents;
		if (this.isInV1StateAndIsBarrierOp(opContents)) {
			this.submitLocalMessage(opContents);
			return;
		}

		assert(
			!this.shouldDropOp(opContents),
			0x8aa /* MigrationShim should not be able to apply v1 ops as they shouldn't have been created locally. */
		);
		this.treeDeltaHandler.applyStashedOp(contents);
	}

	public rollback?(contents: unknown, localOpMetadata: unknown): void {
		const opContents = contents as IOpContents;
		if (isBarrierOp(opContents)) {
			throw new Error('MigrationShim does not support rollback of barrier ops');
		}
		return this.treeDeltaHandler.rollback?.(contents, localOpMetadata);
	}

	private isInV1StateAndIsBarrierOp(contents: IOpContents): boolean {
		return this.isUsingOldV1() && isBarrierOp(contents);
	}

	/**
	 * We should drop an op when we are v2 state and the op is a v1 op or a migrate op.
	 *
	 * @param contents - op contents we expect to interrogate, this could be anything
	 * @returns whether or not we should drop the op
	 */
	private shouldDropOp(contents: IOpContents): boolean {
		assert(!this.isPreAttachState(), 0x82d /* Can't process ops before attaching tree handler */);
		// Don't drop ops when we are in v1 state
		if (this.isUsingOldV1()) {
			return false;
		}

		// Drop v1 ops when in v2 state
		if (!isStampedOp(contents)) {
			return true;
		}

		// Don't drop v2 ops in v2 state
		assert(
			attributesMatch(contents.fluidMigrationStamp, this.attributes),
			0x82e /* Unexpected v2 op with mismatched attributes */
		);
		return false;
	}
}
