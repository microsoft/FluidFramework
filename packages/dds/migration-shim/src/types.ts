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
 *
 * @internal
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
 * An interface for interrogating ops to see if they are v2 stamped ops or migrate ops. Otherwise, we try not to care
 * what the contents of the op are. The contents could be of type `any` or `unknown`.
 *
 * @internal
 */
export interface IOpContents {
	/**
	 * If this type specifically === "barrier", then we know we are dealing with a barrier op
	 */
	type?: string;
	/**
	 * If this is present, then we know we are dealing with a v2 op
	 */
	fluidMigrationStamp?: IChannelAttributes;
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
