/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import {
	IChannel,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
import { ILocalChannelContext, IModifiableFluidDataStoreContext } from "./types";

/**
 * The concept of this class is to scope changes only necessary to data migration here.
 *
 * This class enables replacing channels. Deleting channels is risky. We can achieve
 * very similar results by removing all the handles and deleting all the data.
 */
export class HotSwapFluidDataStoreRuntime extends FluidDataStoreRuntime {
	private readonly replacedContexts: Map<string, ILocalChannelContext> = new Map();
	public constructor(
		private readonly modifiableDataStoreContext: IModifiableFluidDataStoreContext,
		sharedObjectRegistry: ISharedObjectRegistry,
		existing: boolean,
		initializeEntryPoint?: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		super(modifiableDataStoreContext, sharedObjectRegistry, existing, initializeEntryPoint);
	}

	// Returns a detached channel
	public replaceChannel(id: string, channelFactory: IChannelFactory): IChannel {
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
		const context: ILocalChannelContext = this.createLocalChannelContext(
			id,
			channelFactory.type,
			interceptRegistry,
		);
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
