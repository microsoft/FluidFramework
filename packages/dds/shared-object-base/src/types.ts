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
 * Base interface for shared objects from which other interfaces derive. Implemented by SharedObject
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
