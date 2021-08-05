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
import { SharedTreeFactoryOptions } from '../generic';
import { SharedTreeWithAnchors } from './SharedTreeWithAnchors';

/**
 * Factory for SharedTreeWithAnchors.
 * Includes history in the summary.
 * @public
 */
export class SharedTreeWithAnchorsFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public static Type = 'SharedTreeWithAnchors';

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public static Attributes: IChannelAttributes = {
		type: SharedTreeWithAnchorsFactory.Type,
		snapshotFormatVersion: '0.1',
		packageVersion: '0.1',
	};

	/**
	 * @param options - Options for configuring the SharedTreeWithAnchorsFactory
	 */
	constructor(private readonly options: SharedTreeFactoryOptions = {}) {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
	 */
	public get type(): string {
		return SharedTreeWithAnchorsFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return SharedTreeWithAnchorsFactory.Attributes;
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
		const sharedTree = this.createSharedTree(runtime, id);
		await sharedTree.load(services);
		return sharedTree;
	}

	/**
	 * Create a new SharedTree.
	 * @param runtime - data store runtime that owns the new SharedTree
	 * @param id - optional name for the SharedTree
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string, expensiveValidation?: boolean): SharedTreeWithAnchors {
		this.options.expensiveValidation = expensiveValidation;
		const sharedTree = this.createSharedTree(runtime, id);
		sharedTree.initializeLocal();
		return sharedTree;
	}

	private createSharedTree(runtime: IFluidDataStoreRuntime, id: string): SharedTreeWithAnchors {
		const sharedTree = new SharedTreeWithAnchors(
			runtime,
			id,
			this.options.expensiveValidation,
			this.options.summarizeHistory,
			this.options.writeSummaryFormat,
			this.options.uploadEditChunks
		);
		return sharedTree;
	}
}
