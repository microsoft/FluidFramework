/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IDeltaConnection, type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { type SpannerDeltaHandler } from "./spannerDeltaHandler";

/**
 * Represents a connection to a Spanner data store that can receive and submit deltas.
 *
 * This allows the Spanner class to swap out the delta handler on the fly.
 *
 * TODO: stamp the V2 ops until the MSN has passed.
 *
 * This special logic allows for connect to be called for the underlying new SharedObject without the need for
 * modifications on the current ChannelDeltaConnection.
 */
export class SpannerDeltaConnection implements IDeltaConnection {
	public constructor(private readonly deltaConnection: IDeltaConnection) {}
	private _handler: SpannerDeltaHandler | undefined;
	private get handler(): SpannerDeltaHandler {
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
		this.deltaConnection.submit(messageContent, localOpMetadata);
	}

	public isPreAttachState(): boolean {
		return this.handler.isPreAttachState();
	}

	public isUsingOldV1(): boolean {
		return this.handler.isUsingOldV1();
	}

	public isUsingNewV2(): boolean {
		return this.handler.isUsingNewV2();
	}

	public preAttach(handler: SpannerDeltaHandler): void {
		assert(this._handler === undefined, "Should only attempt to preAttach once!");
		this._handler = handler;
		this.deltaConnection.attach(handler);
	}

	// We only want to call attach on the underlying delta connection once, as we'll hit an assert if we call it twice.
	// Note: SharedObject.load calls attach as well as SharedObject.connect
	public attach(handler: IDeltaHandler): void {
		assert(!this.isUsingNewV2(), "Trying to reconnect twice!");
		if (this.isPreAttachState()) {
			this.handler.load(handler);
			return;
		} else if (this.isUsingOldV1()) {
			this.handler.reconnect(handler);
			this.dirty();
		}
		assert(this.isUsingNewV2(), "Unknown handler state!");
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
