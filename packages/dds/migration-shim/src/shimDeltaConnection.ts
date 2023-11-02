/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IDeltaConnection, type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { type IShimDeltaHandler } from "./types.js";

/**
 * Represents a connection to a Shim data store that can receive and submit deltas.
 *
 * This allows the Shim class to swap out the delta handler on the fly.
 *
 * TODO: stamp the V2 ops. Either the MigrationShim needs to pass this logic to the ShimDeltaConnection, or
 * the ShimDeltaConnection needs to do it itself. We can probably put submitting and processing ops on the
 * IShimDeltaHandler interface. I'm of the opinion to iterate over this design. For now we will have one class, and
 * see what works best. Ideally, this class doesn't need to know about swapping handlers. It will need to know to stamp
 * ops as that's how this was designed. We can probably get away with just stamping the ops in the submit method.
 *
 * This special logic allows for connect to be called for the underlying new SharedObject without the need for
 * modifications on the current ChannelDeltaConnection.
 */
export class ShimDeltaConnection implements IDeltaConnection {
	public constructor(
		private readonly deltaConnection: IDeltaConnection,
		private readonly shimDeltaHandler: IShimDeltaHandler,
	) {}
	private isShimDeltaHandlerAttachedToConnection = false;

	public get connected(): boolean {
		return this.deltaConnection.connected;
	}

	// Should we be adding some metadata here?
	public submit(messageContent: unknown, localOpMetadata: unknown): void {
		// TODO: stamp messageContent with V2 metadata - this is not the final implementation
		this.deltaConnection.submit(messageContent, localOpMetadata);
	}

	// We only want to call attach on the underlying delta connection once, as we'll hit an assert if we call it twice.
	// Note: SharedObject.load calls attach as well as SharedObject.connect
	public attach(handler: IDeltaHandler): void {
		// There are essentially two delta handlers that process ops, the shim delta handler to process shim ops
		// preventing them from being processed by the tree delta handler, and the tree delta handler to process tree
		// ops. Post migration v1 ops can be considered "shim" ops as they are dropped.
		this.shimDeltaHandler.attachTreeDeltaHandler(handler);
		if (!this.isShimDeltaHandlerAttachedToConnection) {
			this.deltaConnection.attach(this.shimDeltaHandler);
			this.isShimDeltaHandlerAttachedToConnection = true;
		}
	}
	public dirty(): void {
		this.deltaConnection.dirty();
	}

	// This needs to be more thoroughly thought through. What happens when the source handle is changed?
	public addedGCOutboundReference?(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void {
		this.deltaConnection.addedGCOutboundReference?.(srcHandle, outboundHandle);
	}
}
