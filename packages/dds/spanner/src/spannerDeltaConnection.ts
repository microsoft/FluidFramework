/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { type IDeltaConnection, type IDeltaHandler } from "@fluidframework/datastore-definitions";
import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { SpannerDeltaHandler } from "./spannerDeltaHandler";

/**
 * Represents a connection to a Spanner data store that can receive and submit deltas.
 *
 * This allows the Spanner class to swap out the delta connection on the fly and submit a migrate/barrier op.
 *
 * This special logic allows for connect to be called for the underlying new SharedObject without the need for
 * modifications on the current ChannelDeltaConnection.
 *
 * This should not be the final form.
 */
export class SpannerDeltaConnection implements IDeltaConnection {
	public constructor(private readonly deltaConnection: IDeltaConnection) {}
	private _handler: SpannerDeltaHandler | undefined;

	public get connected(): boolean {
		return this.deltaConnection.connected;
	}

	// This is a hack to allow migrate functionality to be passed to the SpannerDeltaHandler.
	// This should not be the final implementation
	public migrate = (message: ISequencedDocumentMessage): boolean => {
		return false;
	};

	// Should we be adding some metadata here?
	public submit(messageContent: unknown, localOpMetadata: unknown): void {
		// The expectation is to currently add some form of V2 stamp to the metadata here that can eventually be
		// ignored by a SharedObject V2
		this.deltaConnection.submit(messageContent, localOpMetadata);
	}

	// We only want to call attach on the underlying delta connection once, as we'll hit an assert if we call it twice.
	// Note: SharedObject.load calls attach as well as SharedObject.connect
	public attach(handler: IDeltaHandler): void {
		// we only want to actually attach to the delta connection once
		if (this._handler === undefined) {
			this._handler = new SpannerDeltaHandler(handler, (message) => this.migrate(message));
			this.deltaConnection.attach(this._handler);
		} else {
			this._handler.attach(handler);
			this.dirty();
		}
	}
	public dirty(): void {
		this.deltaConnection.dirty();
	}

	// This needs to be more thoroughly thought through. What happens when the source handle is changed?
	public addedGCOutboundReference?(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void {
		assert(
			this.deltaConnection.addedGCOutboundReference !== undefined,
			"undefined addedGCOutboundReference",
		);
		this.deltaConnection.addedGCOutboundReference(srcHandle, outboundHandle);
	}
}
