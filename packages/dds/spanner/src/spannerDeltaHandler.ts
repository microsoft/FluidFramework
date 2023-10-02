/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaHandler } from "@fluidframework/datastore-definitions";

/**
 * Handles incoming and outgoing deltas for the Spanner distributed data structure.
 *
 * Needs to be able to process v1 and v2 ops
 */
export class SpannerDeltaHandler implements IDeltaHandler {
	private newHandler: IDeltaHandler | undefined;
	public constructor(private readonly oldHandler: IDeltaHandler) {}
	private get handler(): IDeltaHandler {
		return this.newHandler ?? this.oldHandler;
	}

	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		return this.handler.process(message, local, localOpMetadata);
	}
	public setConnectionState(connected: boolean): void {
		return this.handler.setConnectionState(connected);
	}
	public reSubmit(message: never, localOpMetadata: unknown): void {
		return this.handler.reSubmit(message, localOpMetadata);
	}
	public applyStashedOp(message: never): unknown {
		return this.handler.applyStashedOp(message);
	}
	public rollback?(message: never, localOpMetadata: unknown): void {
		return this.handler.rollback?.(message, localOpMetadata);
	}

	public attach(handler: IDeltaHandler): void {
		this.newHandler = handler;
	}
}
