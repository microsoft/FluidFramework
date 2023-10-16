/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IDeltaConnection, type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { type IShimDeltaHandler } from "./types";

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
	public constructor(private readonly deltaConnection: IDeltaConnection) {}
	private _handler: IShimDeltaHandler | undefined;
	private get handler(): IShimDeltaHandler {
		assert(this._handler !== undefined, "Missing delta handler");
		return this._handler;
	}

	public get connected(): boolean {
		return this.deltaConnection.connected;
	}

	// Should we be adding some metadata here?
	public submit(messageContent: unknown, localOpMetadata: unknown): void {
		// The expectation is to currently add some form of V2 stamp to the metadata here that can eventually be
		// ignored by a SharedObject V2
		// TODO: stamp messageContent with V2 metadata
		this.deltaConnection.submit(messageContent, localOpMetadata);
	}

	// Note we have an option of also adding submit to the IShimDeltaHandler interface
	// That way in the submit method above we could call this.handler.preSubmit(messageContent, localOpMetadata) to
	// stamp the v2 ops properly.
	public preAttach(handler: IShimDeltaHandler): void {
		assert(this._handler === undefined, "Should only attempt to preAttach once!");
		this._handler = handler;
		this.deltaConnection.attach(handler);
	}

	// We only want to call attach on the underlying delta connection once, as we'll hit an assert if we call it twice.
	// Note: SharedObject.load calls attach as well as SharedObject.connect
	public attach(handler: IDeltaHandler): void {
		this.handler.attach(handler);
	}
	public dirty(): void {
		this.deltaConnection.dirty();
	}

	// This needs to be more thoroughly thought through. What happens when the source handle is changed?
	public addedGCOutboundReference?(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void {
		if (this.deltaConnection.addedGCOutboundReference !== undefined) {
			this.deltaConnection.addedGCOutboundReference(srcHandle, outboundHandle);
		}
	}
}
