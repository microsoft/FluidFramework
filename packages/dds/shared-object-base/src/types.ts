/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IErrorEvent,
	IEventProvider,
	IEventThisPlaceHolder,
} from "@fluidframework/core-interfaces";
import { IChannel } from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

/**
 * Events emitted by {@link ISharedObject}.
 * @legacy
 * @alpha
 */
export interface ISharedObjectEvents extends IErrorEvent {
	/**
	 * Fires before an incoming operation (op) is applied to the shared object.
	 *
	 * @remarks Note: this should be considered an internal implementation detail. It is not recommended for external
	 * use.
	 *
	 * @eventProperty
	 */
	(
		event: "pre-op",
		listener: (
			op: ISequencedDocumentMessage,
			local: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	);

	/**
	 * Fires after an incoming op is applied to the shared object.
	 *
	 * @remarks Note: this should be considered an internal implementation detail. It is not recommended for external
	 * use.
	 *
	 * @eventProperty
	 */
	(
		event: "op",
		listener: (
			op: ISequencedDocumentMessage,
			local: boolean,
			target: IEventThisPlaceHolder,
		) => void,
	);
}

/**
 * Base interface for shared objects from which other interfaces extend.
 * @remarks
 * This interface is not intended to be implemented outside this repository:
 * implementers should migrate to using an existing implementation instead.
 * @privateRemarks
 * Implemented by {@link SharedObjectCore}.
 *
 * TODO: the relationship between the "shared object" abstraction and "channel" abstraction should be clarified and/or unified.
 * Either there should be a single named abstraction or the docs here need to make it clear why adding events and bindToContext to a channel makes it a "shared object".
 * Additionally the docs here need to define what a shared object is, not just claim this interface is for them.
 * If the intention is that the "shared object" concept `IFluidLoadable` mentions is only ever implemented by this interface then even more concept unification should be done.
 * If not then more clarity is needed on what this interface specifically is, what the other "shared object" concept means and how they relate.
 * @legacy
 * @alpha
 */
export interface ISharedObject<TEvent extends ISharedObjectEvents = ISharedObjectEvents>
	extends IChannel,
		IEventProvider<TEvent> {
	/**
	 * Binds the given shared object to its containing data store runtime, causing it to attach once
	 * the runtime attaches.
	 */
	bindToContext(): void;
}
