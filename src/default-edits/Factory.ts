/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelFactory,
	IChannel,
} from '@fluidframework/datastore-definitions';
import { SharedTreeFactoryOptions } from '../generic';
import { SharedTree } from './SharedTree';

/**
 * Factory for SharedTree.
 * Includes history in the summary.
 * @public
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
	 * @param options - Options for configuring the SharedTreeFactory
	 */
	constructor(private readonly options: SharedTreeFactoryOptions = {}) {}

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
	): Promise<IChannel> {
		const sharedTree = this.createSharedTree(runtime, id);
		await sharedTree.load(services);
		return sharedTree;
	}

	/**
	 * Create a new SharedTree.
	 * @param runtime - data store runtime that owns the new SharedTree
	 * @param id - optional name for the SharedTree
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string, expensiveValidation?: boolean): SharedTree {
		this.options.expensiveValidation = expensiveValidation;
		const sharedTree = this.createSharedTree(runtime, id);
		sharedTree.initializeLocal();
		return sharedTree;
	}

	private createSharedTree(runtime: IFluidDataStoreRuntime, id: string): SharedTree {
		const sharedTree = new SharedTree(
			runtime,
			id,
			this.options.expensiveValidation,
			this.options.summarizeHistory,
			this.options.writeFormat,
			this.options.uploadEditChunks
		);
		return sharedTree;
	}
}
