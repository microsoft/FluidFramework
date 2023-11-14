/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISharedTree } from "@fluid-experimental/tree2";
import { type SharedTree as LegacySharedTree } from "@fluid-experimental/tree";
import {
	type IChannel,
	type IChannelAttributes,
	type IChannelServices,
	type IDeltaHandler,
} from "@fluidframework/datastore-definitions";

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

	attached: boolean;

	markAttached(): void;
}

/**
 * An interface for interrogating ops to see if they are stamped or not so that we can choose to drop them.
 *
 * Since contents could be of type `any`, and we only specifically care about whether or not the op is a migrate op or
 * a stamped v2 op, we need to be able to interrogate the contents of the op to see if it is a migrate op or v2 op.
 */
export interface IOpContents {
	type?: string; // If this type specifically === "barrier", then we know we are dealing with a barrier op
	fluidMigrationStamp?: IChannelAttributes; // If this is present, then we know we are dealing with a v2 op
}

/**
 * An interface for a shim channel that intercepts a LegacySharedTree or new SharedTree DDS.
 *
 * @internal
 */
export interface IShim extends IChannel {
	create(): void;
	load(channelServices: IChannelServices): Promise<void>;
	currentTree: ISharedTree | LegacySharedTree;
}
