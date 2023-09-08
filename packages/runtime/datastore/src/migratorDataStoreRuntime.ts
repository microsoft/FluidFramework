/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import { IFluidDataStoreContext, ISummarizerNodeWithGC } from "@fluidframework/runtime-definitions";
import { IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "./dataStoreRuntime";

export interface IModifiableFluidDataStoreContext {
	summarizerNode: ISummarizerNodeWithGC;
}

/**
 * The concept of this class is to scope changes only necessary to data migration here.
 *
 * This class enables replacing channels. Deleting channels is risky. We can achieve
 * very similar results by removing all the handles and deleting all the data.
 */
export class MigratorFluidDataStoreRuntime extends FluidDataStoreRuntime {
	public constructor(
		protected readonly _dataStoreContext: IFluidDataStoreContext,
		sharedObjectRegistry: ISharedObjectRegistry,
		existing: boolean,
		initializeEntryPoint?: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		super(_dataStoreContext, sharedObjectRegistry, existing, initializeEntryPoint);
	}

	private interceptFactory?: IChannelFactory;

	// Returns a detached channel
	public replaceChannel(id: string, channelFactory: IChannelFactory) {
		assert(this.contexts.has(id), "channel to be replaced should exist!");
		const dataStoreContext = this
			._dataStoreContext as unknown as IModifiableFluidDataStoreContext;
		if (dataStoreContext.summarizerNode.getChild(id) !== undefined) {
			// Local channels don't have summarizer nodes.
			dataStoreContext.summarizerNode.deleteChild(id);
		}
		this.contexts.delete(id);
		this.interceptFactory = channelFactory;
		const channel = this.createChannel(id, channelFactory.type);
		return channel;
	}

	protected createLocalChannelContext(
		id: string,
		type: string,
		sharedObjectRegistry: ISharedObjectRegistry,
	) {
		const interceptRegistry =
			this.interceptFactory !== undefined
				? new InterceptSharedObjectRegistry(sharedObjectRegistry, this.interceptFactory)
				: sharedObjectRegistry;

		return super.createLocalChannelContext(id, type, interceptRegistry);
	}
}

class InterceptSharedObjectRegistry implements ISharedObjectRegistry {
	constructor(
		private readonly sharedObjectRegistry: ISharedObjectRegistry,
		private readonly channelFactory: IChannelFactory,
	) {}
	get(name: string): IChannelFactory | undefined {
		if (name === this.channelFactory.type) {
			return this.channelFactory;
		}
		return this.sharedObjectRegistry.get(name);
	}
}
