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
 * DO NOT USE THIS CLASS DIRECTLY.
 */
export class UnsafeHotSwapFluidDataStoreRuntime extends FluidDataStoreRuntime {
	private readonly replacedContexts: Map<string, ILocalChannelContext> = new Map();
	public constructor(
		private readonly modifiableDataStoreContext: IModifiableFluidDataStoreContext,
		private readonly _sharedObjectRegistry: ISharedObjectRegistry,
		existing: boolean,
		initializeEntryPoint?: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		super(modifiableDataStoreContext, _sharedObjectRegistry, existing, initializeEntryPoint);
	}

	// Returns a detached channel
	public [".UNSAFE_replaceChannel"](id: string, channelFactory: IChannelFactory): IChannel {
		// Local channels don't have summarizer nodes.
		if (this.modifiableDataStoreContext.summarizerNode.getChild(id) !== undefined) {
			this.modifiableDataStoreContext.summarizerNode.deleteChild(id);
		}
		this[".UNSAFE_localDeleteChannelContext"](id);
		const interceptRegistry = new InterceptSharedObjectRegistry(
			this._sharedObjectRegistry,
			channelFactory,
		);
		const context: ILocalChannelContext = this[".UNSAFE_createLocalChannelContext"](
			id,
			channelFactory.type,
			interceptRegistry,
		);
		this[".UNSAFE_addChannelContext"](id, context);
		this.replacedContexts.set(id, context);
		return context.channel;
	}

	public [".UNSAFE_reattachChannel"](channel: IChannel): void {
		this.verifyNotClosed();
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
