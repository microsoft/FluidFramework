/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IDeltaHandler } from "@fluidframework/datastore-definitions";

/**
 * An interface for a shim delta handler intercepts another delta handler.
 */
export interface IShimDeltaHandler extends IDeltaHandler {
	/**
	 * Attaches a delta handler to this attachable delta handler.
	 * @param handler - The delta handler to attach.
	 */
	attach(handler: IDeltaHandler): void;

	// TODO: preSubmit(messageContent: unknown, localOpMetadata: unknown): void; ?
}
