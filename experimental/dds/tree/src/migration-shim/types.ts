/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IChannel,
	type IChannelAttributes,
	type IChannelServices,
	type IDeltaHandler,
} from '@fluidframework/datastore-definitions/internal';
import { type ITree } from '@fluidframework/tree';

import { type SharedTree as LegacySharedTree } from '../SharedTree.js';

import { type IMigrationOp } from './migrationShim.js';

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
 * A v1 op or a v2 unstamped op
 */
export interface IUnstampedContents {
	fluidMigrationStamp?: IChannelAttributes;
	[key: string | number]: unknown;
}

/**
 * A v2 op will have a `fluidMigrationStamp` property. This is a type guard to check if the op is a v2 op.
 */
export interface IStampedContents {
	fluidMigrationStamp: IChannelAttributes;
	[key: string | number]: unknown;
}

/**
 * A type for interrogating ops to see if they are v2 stamped ops or migrate ops. Otherwise, we try not to care
 * what the contents of the op are. The contents could be of type `any` or `unknown`.
 *
 * If `type` specifically === "barrier", then we know we are dealing with a barrier op
 *
 * If `fluidMigrationStamp` is present, then we know we are dealing with a v2 op
 *
 * @internal
 */
export type IOpContents = IStampedContents | IUnstampedContents | IMigrationOp;

/**
 * An interface for a shim channel that intercepts a LegacySharedTree or new SharedTree DDS.
 *
 * @internal
 */
export interface IShim extends IChannel {
	create(): void;
	load(channelServices: IChannelServices): Promise<void>;
	currentTree: ITree | LegacySharedTree;
}
