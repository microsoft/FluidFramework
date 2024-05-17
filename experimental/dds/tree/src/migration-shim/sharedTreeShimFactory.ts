/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils/internal';
import {
	type IChannelAttributes,
	type IChannelFactory,
	type IFluidDataStoreRuntime,
	type IChannelServices,
} from '@fluidframework/datastore-definitions/internal';
import type { ITree } from '@fluidframework/tree';

import { SharedTreeShim } from './sharedTreeShim.js';
import { attributesMatch } from './utils.js';

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link SharedTreeShim}.
 *
 * Creates the migration shim that allows a migration from legacy shared tree to shared tree.
 * Note: There may be a need for 3 different factories for different parts of the migration.
 * That or three different shims. Potentially we can just do 2 as 2 and 3 can be combined.
 * 1. pre-migration
 * 2. after a summary has been generated but there may still be potential v1 ops
 * 3. post-migration after a summary has been generated and the msn has moved far enough forward for only v2 ops
 *
 * @sealed
 * @internal
 */
export class SharedTreeShimFactory implements IChannelFactory {
	public constructor(private readonly factory: IChannelFactory<ITree>) {}

	/**
	 * Can only load the new SharedTree - this allows our snapshots to be simple. We do not have to consider any new
	 * unique snapshot formats and how to load from them.
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return this.factory.type;
	}

	/**
	 * Should be the new SharedTree attributes - this should indicate what type of tree snapshot we are expecting or
	 * are capable of loading from.
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return this.factory.attributes;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.load}
	 *
	 * Should be loading the SharedTreeShim from a new SharedTree snapshot only.
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes
	): Promise<SharedTreeShim> {
		// TODO: remove attributes check and move it to an automated test that constructing a SharedTreeShimFactory and checking its attributes/type matches the oldFactory.
		assert(attributesMatch(attributes, this.factory.attributes), 0x7ef /* Attributes do not match */);
		const sharedTreeShim = new SharedTreeShim(id, runtime, this.factory);
		await sharedTreeShim.load(services);
		return sharedTreeShim;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.create}
	 *
	 * Should be only creating the SharedTreeShim, which will only generate a new SharedTree snapshot. That way we do
	 * not have the capability of accidentally creating a LegacySharedTree snapshot.
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): SharedTreeShim {
		const sharedTreeShim = new SharedTreeShim(id, runtime, this.factory);
		sharedTreeShim.create();
		return sharedTreeShim;
	}
}
