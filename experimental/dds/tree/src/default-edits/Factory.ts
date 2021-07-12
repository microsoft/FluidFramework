/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
	public create(runtime: IFluidDataStoreRuntime, id: string, expensiveValidation?: boolean): SharedTree {
		const sharedTree = new SharedTree(runtime, id, expensiveValidation, this.includeHistoryInSummary());
		sharedTree.initializeLocal();
		return sharedTree;
	}

	/**
	 * Determines how the SharedTree will summarize the history.
	 * This is a workaround for lacking the ability to construct DDSs with custom parameters.
	 */
	protected includeHistoryInSummary(): boolean {
		return true;
	}
}

/**
 * Factory for SharedTree.
 * Does not include the history in the summary.
 * This is a workaround for lacking the ability to construct DDSs with custom parameters.
 * TODO:#54918: Clean up when DDS parameterization is supported.
 * @public
 */
export class SharedTreeFactoryNoHistory extends SharedTreeFactory {
	protected includeHistoryInSummary(): boolean {
		return false;
	}
}
