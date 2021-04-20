/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelFactory,
} from '@fluidframework/datastore-definitions';
import { ISharedObject } from '@fluidframework/shared-object-base';
import { SharedTree } from './SharedTree';

/**
 * Factory for SharedTree.
 * @public
 * @sealed
 */
export class SharedTreeFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public static Type = 'SharedTree';

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public static Attributes: IChannelAttributes = {
		type: SharedTreeFactory.Type,
		snapshotFormatVersion: '0.1',
		packageVersion: '0.1',
	};

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public get type(): string {
		return SharedTreeFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return SharedTreeFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		_channelAttributes: Readonly<IChannelAttributes>
	): Promise<ISharedObject> {
		const sharedTree = new SharedTree(runtime, id);
		await sharedTree.load(services);
		return sharedTree;
	}

	/**
	 * Create a new SharedTree.
	 * @param runtime - data store runtime that owns the new SharedTree
	 * @param id - optional name for the SharedTree
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedObject {
		const sharedTree = new SharedTree(runtime, id);
		sharedTree.initializeLocal();
		return sharedTree;
	}
}
