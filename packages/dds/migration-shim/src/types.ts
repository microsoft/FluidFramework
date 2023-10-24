/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IChannelAttributes, type IDeltaHandler } from "@fluidframework/datastore-definitions";

/**
 * An interface for a shim delta handler intercepts another delta handler.
 */
export interface IShimDeltaHandler extends IDeltaHandler {
	/**
	 * Provide the real tree delta handler (either legacy or new) to the shim that will be used to process the tree ops.
	 * @param treeDeltaHandler - The appropriate tree delta handler.
	 */
	attachTreeDeltaHandler(treeDeltaHandler: IDeltaHandler): void;

	/**
	 * The delta handler needs to be attached to the IShimDeltaHandler before attaching it to the delta connection.
	 * Otherwise the IShimDeltaHandler will not be able to process ops.
	 */
	hasTreeDeltaHandler(): boolean;

	/**
	 * This allows the shim to stamp the op with the appropriate metadata before submitting it to the delta connection.
	 *
	 * @param content - content of the op we are stamping
	 * @param localOpMetadata - metadata of the op we are stamping
	 */
	preSubmit(content: IStampedContents, localOpMetadata: unknown): void;
}

/**
 * An interface for interrogating ops to see if they are stamped or not so that we can choose to drop them.
 */
export interface IStampedContents {
	fluidMigrationStamp?: IChannelAttributes;
}
