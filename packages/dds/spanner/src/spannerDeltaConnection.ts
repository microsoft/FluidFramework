/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { IDeltaConnection, IDeltaHandler } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { SpannerDeltaHandler } from "./spannerDeltaHandler";

/**
 * Represents a connection to a Spanner data store that can receive and submit deltas.
 */
export class SpannerDeltaConnection implements IDeltaConnection {
	public constructor(private readonly deltaConnection: IDeltaConnection) {}
	private _handler: SpannerDeltaHandler | undefined;

	public get connected(): boolean {
		return this.deltaConnection.connected;
	}

	public migrate = (message: ISequencedDocumentMessage): boolean => {
		return false;
	};

	// Should we be adding some metadata here?
	public submit(messageContent: unknown, localOpMetadata: unknown): void {
		this.deltaConnection.submit(messageContent, localOpMetadata);
	}
	public attach(handler: IDeltaHandler): void {
		// we only want to actually attach to the delta connection once
		if (this._handler !== undefined) {
			this._handler.attach(handler);
			this.dirty();
		} else {
			this._handler = new SpannerDeltaHandler(handler, (message) => this.migrate(message));
			this.deltaConnection.attach(this._handler);
		}
	}
	public dirty(): void {
		this.deltaConnection.dirty();
	}
	public addedGCOutboundReference?(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void {
		assert(
			this.deltaConnection.addedGCOutboundReference !== undefined,
			"undefined addedGCOutboundReference",
		);
		this.deltaConnection.addedGCOutboundReference(srcHandle, outboundHandle);
	}
}
