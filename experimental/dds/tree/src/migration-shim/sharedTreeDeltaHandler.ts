/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils/internal';
import { type IChannelAttributes, type IDeltaHandler } from '@fluidframework/datastore-definitions/internal';
import { MessageType, type ISequencedDocumentMessage } from '@fluidframework/driver-definitions/internal';
import type { IRuntimeMessageCollection, IRuntimeMessagesContent } from '@fluidframework/runtime-definitions/internal';

import { type IOpContents, type IShimDeltaHandler } from './types.js';
import { attributesMatch, isStampedOp } from './utils.js';

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
	public constructor(private readonly attributes: IChannelAttributes) {}

	private _handler?: IDeltaHandler;
	private get handler(): IDeltaHandler {
		const handler = this._handler;
		assert(handler !== undefined, 0x7eb /* No handler to process op */);
		return handler;
	}

	private _attached = false;
	public get attached(): boolean {
		return this._attached;
	}

	public markAttached(): void {
		this._attached = true;
	}

	public attachTreeDeltaHandler(handler: IDeltaHandler): void {
		assert(this._handler === undefined, 0x7ec /* Should only be able to connect once! */);
		this._handler = handler;
	}

	public hasTreeDeltaHandler(): boolean {
		return this._handler !== undefined;
	}

	private process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
		// This allows us to process the migrate op and prevent the shared object from processing the wrong ops
		// Drop v1 ops
		assert(this.hasTreeDeltaHandler(), 0x831 /* Can't process ops before attaching tree handler */);

		if (message.type !== MessageType.Operation) {
			return;
		}
		const contents = message.contents as IOpContents;
		if (this.shouldDropOp(contents)) {
			return;
		}
		const messagesContent: IRuntimeMessagesContent[] = [
			{
				contents,
				localOpMetadata,
				clientSequenceNumber: message.clientSequenceNumber,
			},
		];
		return this.handler.processMessages({ envelope: message, messagesContent, local });
	}

	public processMessages(messagesCollection: IRuntimeMessageCollection): void {
		const { envelope, messagesContent, local } = messagesCollection;
		for (const { contents, localOpMetadata, clientSequenceNumber } of messagesContent) {
			this.process({ ...envelope, contents, clientSequenceNumber }, local, localOpMetadata);
		}
	}

	// No idea whether any of the below 4 methods work as expected
	public setConnectionState(connected: boolean): void {
		return this.handler.setConnectionState(connected);
	}

	// Resubmitting v1 ops should fail. We should not be resubmitting v1 ops.
	public reSubmit(contents: unknown, localOpMetadata: unknown): void {
		assert(
			!this.shouldDropOp(contents as IOpContents),
			0x832 /* Should not be able to rollback v1 ops as they shouldn't have been created locally. */
		);
		return this.handler.reSubmit(contents, localOpMetadata);
	}

	// We are not capable of applying stashed v1 ops.
	public applyStashedOp(contents: unknown): void {
		assert(
			!this.shouldDropOp(contents as IOpContents),
			0x8ab /* SharedTreeShim should not be able to apply v1 ops as they shouldn't have been created locally. */
		);
		this.handler.applyStashedOp(contents);
	}

	/**
	 * We cannot rollback v1 ops, we have already migrated and are in v2 state, thus we should not be able to generate.
	 * v1 ops
	 */
	public rollback?(contents: unknown, localOpMetadata: unknown): void {
		assert(
			!this.shouldDropOp(contents as IOpContents),
			0x833 /* Should not be able to rollback v1 ops as they shouldn't have been created locally. */
		);
		return this.handler.rollback?.(contents, localOpMetadata);
	}

	/**
	 * The SharedTreeShimDeltaHandler is already in a v2 state. Thus it should drop all v1 and migrate ops.
	 * @param contents - the interrogable op contents to figure out if this is a v1 op, a migrate op, or a v2 op.
	 * @returns whether or not the op is a v1 or migrate op and should be dropped/ignored.
	 */
	private shouldDropOp(contents: IOpContents): boolean {
		if (!isStampedOp(contents)) {
			return true;
		}

		// Don't drop v2 ops in v2 state
		assert(
			attributesMatch(contents.fluidMigrationStamp, this.attributes),
			0x834 /* Unexpected v2 op with mismatched attributes */
		);
		return false;
	}
}
