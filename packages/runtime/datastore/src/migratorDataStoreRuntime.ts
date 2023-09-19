/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import { IFluidDataStoreContext, ISummarizerNodeWithGC } from "@fluidframework/runtime-definitions";
import {
	IChannel,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "./dataStoreRuntime";
import { LocalChannelContext } from "./localChannelContext";

interface IModifiableFluidDataStoreContext extends IFluidDataStoreContext {
	summarizerNode: ISummarizerNodeWithGC;
}

/**
 * The concept of this class is to scope changes only necessary to data migration here.
 *
 * This class enables replacing channels. Deleting channels is risky. We can achieve
 * very similar results by removing all the handles and deleting all the data.
 */
export class MigratorFluidDataStoreRuntime extends FluidDataStoreRuntime {
	private readonly modifiableDataStoreContext: IModifiableFluidDataStoreContext;
	private readonly replacedContexts: Map<string, LocalChannelContext> = new Map();
	public constructor(
		dataStoreContext: IFluidDataStoreContext,
		sharedObjectRegistry: ISharedObjectRegistry,
		existing: boolean,
		initializeEntryPoint?: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		super(dataStoreContext, sharedObjectRegistry, existing, initializeEntryPoint);
		this.modifiableDataStoreContext = dataStoreContext as IModifiableFluidDataStoreContext;
	}

	// Returns a detached channel
	public replaceChannel(id: string, channelFactory: IChannelFactory) {
		assert(this.contexts.has(id), "channel to be replaced should exist!");
		// Local channels don't have summarizer nodes.
		if (this.modifiableDataStoreContext.summarizerNode.getChild(id) !== undefined) {
			this.modifiableDataStoreContext.summarizerNode.deleteChild(id);
		}
		this.contexts.delete(id);
		const interceptRegistry = new InterceptSharedObjectRegistry(
			this.sharedObjectRegistry,
			channelFactory,
		);
		const context = this.createLocalChannelContext(id, channelFactory.type, interceptRegistry);
		this.contexts.set(id, context);
		this.replacedContexts.set(id, context);
		return context.channel;
	}

	public reAttachChannel(channel: IChannel): void {
		this.verifyNotClosed();
		assert(this.contexts.has(channel.id), "The replaced channel context have been created!");
		const context = this.replacedContexts.get(channel.id);
		assert(context !== undefined, "The replaced channel context should have been replaced!");
		context.makeVisible();
		this.replacedContexts.delete(channel.id);
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
