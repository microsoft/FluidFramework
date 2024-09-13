/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils/internal';
import {
	type IChannelAttributes,
	type IDeltaConnection,
	type IDeltaHandler,
} from '@fluidframework/datastore-definitions/internal';

import { type IShimDeltaHandler, type IUnstampedContents } from './types.js';

/**
 * Represents a connection to a Shim data store that can receive and submit deltas.
 *
 * This allows the Shim class to swap out the delta handler on the fly.
 *
 * The PreMigrationDeltaConnection does not stamp ops so that those ops can be considered v1 ops.
 *
 * This special logic allows for connect to be called for the underlying new SharedObject without the need for
 * modifications on the current ChannelDeltaConnection.
 */
export class PreMigrationDeltaConnection implements IDeltaConnection {
	public constructor(
		private readonly deltaConnection: IDeltaConnection,
		private readonly shimDeltaHandler: IShimDeltaHandler
	) {}

	public get connected(): boolean {
		return this.deltaConnection.connected;
	}

	private canSubmit = true;
	public disableSubmit(): void {
		this.canSubmit = false;
	}

	// This is for submitting v1 ops
	public submit(messageContent: unknown, localOpMetadata: unknown): void {
		if (this.canSubmit) {
			this.deltaConnection.submit(messageContent, localOpMetadata);
		}
		// We don't want to throw so we can revert local changes on the LegacySharedTree
	}

	// We only want to call attach on the underlying delta connection once, as we'll hit an assert if we call it twice.
	// Note: SharedObject.load calls attach as well as SharedObject.connect
	public attach(handler: IDeltaHandler): void {
		// There are essentially two delta handlers that process ops, the shim delta handler to process shim ops
		// preventing them from being processed by the tree delta handler, and the tree delta handler to process tree
		// ops. Post migration v1 ops can be considered "shim" ops as they are dropped.
		this.shimDeltaHandler.attachTreeDeltaHandler(handler);
		if (!this.shimDeltaHandler.attached) {
			this.deltaConnection.attach(this.shimDeltaHandler);
			this.shimDeltaHandler.markAttached();
		}
	}
	public dirty(): void {
		this.deltaConnection.dirty();
	}
}

/**
 * A delta connection that stamps ops with a particular channel attributes so that those ops won't get dropped
 */
export class StampDeltaConnection implements IDeltaConnection {
	public constructor(
		private readonly deltaConnection: IDeltaConnection,
		private readonly shimDeltaHandler: IShimDeltaHandler,
		private readonly attributes: IChannelAttributes
	) {}

	public get connected(): boolean {
		return this.deltaConnection.connected;
	}

	// This is for submitting v2 ops
	public submit(messageContent: IUnstampedContents, localOpMetadata: unknown): void {
		assert(messageContent.fluidMigrationStamp === undefined, 0x835 /* Should not be stamping ops twice! */);
		messageContent.fluidMigrationStamp = {
			...this.attributes,
		};
		this.deltaConnection.submit(messageContent, localOpMetadata);
	}

	/**
	 * For the MigrationShim because we only attach once to the actual delta connection, we store state in the
	 * migrationDeltaHandler to know if we've already attached. We will call attach once on the
	 * PreMigrationDeltaConnection and once on the StampDeltaConnection.
	 *
	 * The SharedTreeShim should not be swapping delta connections and thus the if statement should always be executed.
	 *
	 * @param handler - this delta handler can only connect once.
	 */
	public attach(handler: IDeltaHandler): void {
		// Maybe put an assert here to only call attach once?
		this.shimDeltaHandler.attachTreeDeltaHandler(handler);
		if (!this.shimDeltaHandler.attached) {
			this.deltaConnection.attach(this.shimDeltaHandler);
			this.shimDeltaHandler.markAttached();
		}
	}

	public dirty(): void {
		this.deltaConnection.dirty();
	}
}
