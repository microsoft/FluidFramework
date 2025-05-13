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
import { type ITree } from '@fluidframework/tree';

import {
	type SharedTree as LegacySharedTree,
	type SharedTreeFactory as LegacySharedTreeFactory,
} from '../SharedTree.js';

import { MigrationShim } from './migrationShim.js';
import { attributesMatch } from './utils.js';

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link MigrationShim}.
 *
 * Creates the migration shim that allows a migration from legacy shared tree to shared tree.
 * @remarks
 *
 * It takes over the attributes of the legacy factory, so that it is loaded instead of the normal legacy factory.  Once migration finishes, the shim it produces will change its attributes to those of the new factory - meaning that on the next summarization the shim will write a summary that will cause future clients to load a different factory and shim (the SharedTreeShimFactory and SharedTreeShim).
 * 1. pre-migration
 *
 * @sealed
 * @internal
 */
export class MigrationShimFactory implements IChannelFactory {
	public constructor(
		private readonly oldFactory: LegacySharedTreeFactory,
		private readonly newFactory: IChannelFactory<ITree>,
		private readonly populateNewChannelFn: (oldChannel: LegacySharedTree, newChannel: ITree) => void
	) {}

	/**
	 * This factory takes over the type of the oldFactory to load in its place.  The user must not include the MigrationShimFactory and the oldFactory in the same registry to avoid conflict.
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return this.oldFactory.type;
	}

	/**
	 * Should be the LegacySharedTree attributes
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return this.oldFactory.attributes;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.load}
	 *
	 * Should be loading the MigrationShim - it should just load the old tree as this makes the factory's
	 * responsibility simple. Trying to follow the Single Responsibility Principle here.
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes
	): Promise<MigrationShim> {
		// TODO: remove attributes check and move it to an automated test that constructing a MigrationShimFactory and checking its attributes/type matches the oldFactory.
		assert(attributesMatch(attributes, this.oldFactory.attributes), 0x7ea /* Attributes do not match */);
		const migrationShim = new MigrationShim(id, runtime, this.oldFactory, this.newFactory, this.populateNewChannelFn);
		await migrationShim.load(services);
		return migrationShim;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.create}
	 *
	 * Create MigrationShim that can hot swap from one DDS to a new DDS. We want the capability of creating an old tree
	 * as when this code rolls out, there may be clients on the v1 version of the code, and we may want to have a dark
	 * rollout capability.
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): MigrationShim {
		// Maybe this should throw an error.
		const migrationShim = new MigrationShim(id, runtime, this.oldFactory, this.newFactory, this.populateNewChannelFn);
		migrationShim.create();
		return migrationShim;
	}
}
