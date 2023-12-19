/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// False positive: this is an import from the `events` package, not from Node.
// eslint-disable-next-line unicorn/prefer-node-protocol
import { EventEmitter } from "events";
import {
	IEvent,
	TransformedEvent,
	IEventTransformer,
	IEventProvider,
} from "@fluidframework/core-interfaces";

/**
 * The event emitter polyfill and the node event emitter have different event types:
 * string | symbol vs. string | number
 *
 * This type allow us to correctly handle either type
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventEmitterEventType = EventEmitter extends { on(event: infer E, listener: any) }
	? E
	: never;

/**
 * @public
 */
export type TypedEventTransform<TThis, TEvent> =
	// Event emitter supports some special events for the emitter itself to use
	// this exposes those events for the TypedEventEmitter.
	// Since we know what the shape of these events are, we can describe them directly via a TransformedEvent
	// which easier than trying to extend TEvent directly
	TransformedEvent<
		TThis,
		"newListener" | "removeListener",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		Parameters<(event: string, listener: (...args: any[]) => void) => void>
	> &
		// Expose all the events provides by TEvent
		IEventTransformer<TThis, TEvent & IEvent> &
		// Add the default overload so this is covertable to EventEmitter regardless of environment
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		TransformedEvent<TThis, EventEmitterEventType, any[]>;

/**
 * Event Emitter helper class the supports emitting typed events
 * @public
 */
export class TypedEventEmitter<TEvent>
	extends EventEmitter
	implements IEventProvider<TEvent & IEvent>
{
	constructor() {
		super();
		this.addListener = super.addListener.bind(this) as TypedEventTransform<this, TEvent>;
		this.on = super.on.bind(this) as TypedEventTransform<this, TEvent>;
		this.once = super.once.bind(this) as TypedEventTransform<this, TEvent>;
		this.prependListener = super.prependListener.bind(this) as TypedEventTransform<
			this,
			TEvent
		>;
		this.prependOnceListener = super.prependOnceListener.bind(this) as TypedEventTransform<
			this,
			TEvent
		>;
		this.removeListener = super.removeListener.bind(this) as TypedEventTransform<this, TEvent>;
		this.off = super.off.bind(this) as TypedEventTransform<this, TEvent>;
	}
	readonly addListener: TypedEventTransform<this, TEvent>;
	readonly on: TypedEventTransform<this, TEvent>;
	readonly once: TypedEventTransform<this, TEvent>;
	readonly prependListener: TypedEventTransform<this, TEvent>;
	readonly prependOnceListener: TypedEventTransform<this, TEvent>;
	readonly removeListener: TypedEventTransform<this, TEvent>;
	readonly off: TypedEventTransform<this, TEvent>;
}
