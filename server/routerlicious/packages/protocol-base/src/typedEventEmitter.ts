/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { EventEmitter } from "events";

/**
 * Base interface for event emitters.
 * @internal
 */
export interface IEvent {
	/**
	 * Base event emitter signature.
	 *
	 * @remarks The event emitter polyfill and the node event emitter have different event types:
	 * `string | symbol` vs. `string | number`.
	 *
	 * So for our typing we'll contrain to string, that way we work with both.
	 *
	 * @eventProperty
	 */

	(event: string, listener: (...args: any[]) => void);
}

/**
 * Base interface for error event emitters.
 * @internal
 */
export interface IErrorEvent extends IEvent {
	/**
	 * Base error event emitter signature.
	 *
	 * @eventProperty
	 *
	 */

	(event: "error", listener: (message: any) => void);
}

/**
 * Base interface for event providers.
 * @internal
 */
export interface IEventProvider<TEvent extends IEvent> {
	/**
	 * Registers a callback to be invoked when the corresponding event is triggered.
	 */
	readonly on: IEventTransformer<this, TEvent>;

	/**
	 * Registers a callback to be invoked the first time (after registration) the corresponding event is triggered.
	 */
	readonly once: IEventTransformer<this, TEvent>;

	/**
	 * Removes the corresponding event if it has been registered.
	 */
	readonly off: IEventTransformer<this, TEvent>;
}

// These types handle replacing IEventThisPlaceHolder with `this`, so we can
// support polymorphic `this`. For instance if an event wanted to be:
// (event: "some-event", listener:(target: this)=>void)
//
// it should be written as
// (event: "some-event", listener:(target: IEventThisPlaceHolder)=>void)
//
// and IEventThisPlaceHolder will be replaced with this.
// This is all consumers of these types need to know.

/**
 * The placeholder type that should be used instead of `this` in events.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type IEventThisPlaceHolder = { thisPlaceHolder: "thisPlaceHolder" };

/**
 * Does the type replacement by changing types of {@link IEventThisPlaceHolder} to `TThis`
 * @internal
 */

export type ReplaceIEventThisPlaceHolder<L extends any[], TThis> = L extends any[]
	? { [K in keyof L]: L[K] extends IEventThisPlaceHolder ? TThis : L[K] }
	: L;

/**
 * Transforms the event overload by replacing {@link IEventThisPlaceHolder} with `TThis` in the event listener
 * arguments and having the overload return `TTHis` as well
 * @internal
 */

export type TransformedEvent<TThis, E, A extends any[]> = (
	event: E,
	listener: (...args: ReplaceIEventThisPlaceHolder<A, TThis>) => void,
) => TThis;

/**
 * This type is a conditional type for transforming all the overloads provided in `TEvent`.
 *
 * @remarks
 * Due to limitations of the TypeScript typing system, we need to handle each number of overload individually.
 * It currently supports the max of 15 event overloads which is more than we use anywhere.
 * At more than 15 overloads we start to hit {@link https://github.com/microsoft/TypeScript/issues/37209 | TS2589}.
 * If we need to move beyond 15 we should evaluate using a mapped type pattern like `{"event":(listenerArgs)=>void}`
 *
 * @internal
 */
export type IEventTransformer<TThis, TEvent extends IEvent> = TEvent extends {
	(event: infer E0, listener: (...args: infer A0) => void);
	(event: infer E1, listener: (...args: infer A1) => void);
	(event: infer E2, listener: (...args: infer A2) => void);
	(event: infer E3, listener: (...args: infer A3) => void);
	(event: infer E4, listener: (...args: infer A4) => void);
	(event: infer E5, listener: (...args: infer A5) => void);
	(event: infer E6, listener: (...args: infer A6) => void);
	(event: infer E7, listener: (...args: infer A7) => void);
	(event: infer E8, listener: (...args: infer A8) => void);
	(event: infer E9, listener: (...args: infer A9) => void);
	(event: infer E10, listener: (...args: infer A10) => void);
	(event: infer E11, listener: (...args: infer A11) => void);
	(event: infer E12, listener: (...args: infer A12) => void);
	(event: infer E13, listener: (...args: infer A13) => void);
	(event: infer E14, listener: (...args: infer A14) => void);
	(event: string, listener: (...args: any[]) => void);
}
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7> &
			TransformedEvent<TThis, E8, A8> &
			TransformedEvent<TThis, E9, A9> &
			TransformedEvent<TThis, E10, A10> &
			TransformedEvent<TThis, E11, A11> &
			TransformedEvent<TThis, E12, A12> &
			TransformedEvent<TThis, E13, A13> &
			TransformedEvent<TThis, E14, A14>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: infer E7, listener: (...args: infer A7) => void);
			(event: infer E8, listener: (...args: infer A8) => void);
			(event: infer E9, listener: (...args: infer A9) => void);
			(event: infer E10, listener: (...args: infer A10) => void);
			(event: infer E11, listener: (...args: infer A11) => void);
			(event: infer E12, listener: (...args: infer A12) => void);
			(event: infer E13, listener: (...args: infer A13) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7> &
			TransformedEvent<TThis, E8, A8> &
			TransformedEvent<TThis, E9, A9> &
			TransformedEvent<TThis, E10, A10> &
			TransformedEvent<TThis, E11, A11> &
			TransformedEvent<TThis, E12, A12> &
			TransformedEvent<TThis, E13, A13>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: infer E7, listener: (...args: infer A7) => void);
			(event: infer E8, listener: (...args: infer A8) => void);
			(event: infer E9, listener: (...args: infer A9) => void);
			(event: infer E10, listener: (...args: infer A10) => void);
			(event: infer E11, listener: (...args: infer A11) => void);
			(event: infer E12, listener: (...args: infer A12) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7> &
			TransformedEvent<TThis, E8, A8> &
			TransformedEvent<TThis, E9, A9> &
			TransformedEvent<TThis, E10, A10> &
			TransformedEvent<TThis, E11, A11> &
			TransformedEvent<TThis, E12, A12>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: infer E7, listener: (...args: infer A7) => void);
			(event: infer E8, listener: (...args: infer A8) => void);
			(event: infer E9, listener: (...args: infer A9) => void);
			(event: infer E10, listener: (...args: infer A10) => void);
			(event: infer E11, listener: (...args: infer A11) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7> &
			TransformedEvent<TThis, E8, A8> &
			TransformedEvent<TThis, E9, A9> &
			TransformedEvent<TThis, E10, A10> &
			TransformedEvent<TThis, E11, A11>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: infer E7, listener: (...args: infer A7) => void);
			(event: infer E8, listener: (...args: infer A8) => void);
			(event: infer E9, listener: (...args: infer A9) => void);
			(event: infer E10, listener: (...args: infer A10) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7> &
			TransformedEvent<TThis, E8, A8> &
			TransformedEvent<TThis, E9, A9> &
			TransformedEvent<TThis, E10, A10>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: infer E7, listener: (...args: infer A7) => void);
			(event: infer E8, listener: (...args: infer A8) => void);
			(event: infer E9, listener: (...args: infer A9) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7> &
			TransformedEvent<TThis, E8, A8> &
			TransformedEvent<TThis, E9, A9>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: infer E7, listener: (...args: infer A7) => void);
			(event: infer E8, listener: (...args: infer A8) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7> &
			TransformedEvent<TThis, E8, A8>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: infer E7, listener: (...args: infer A7) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6> &
			TransformedEvent<TThis, E7, A7>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: infer E6, listener: (...args: infer A6) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5> &
			TransformedEvent<TThis, E6, A6>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: infer E5, listener: (...args: infer A5) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4> &
			TransformedEvent<TThis, E5, A5>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);
			(event: infer E4, listener: (...args: infer A4) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3> &
			TransformedEvent<TThis, E4, A4>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: infer E3, listener: (...args: infer A3) => void);

			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2> &
			TransformedEvent<TThis, E3, A3>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: infer E2, listener: (...args: infer A2) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> &
			TransformedEvent<TThis, E1, A1> &
			TransformedEvent<TThis, E2, A2>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: infer E1, listener: (...args: infer A1) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1>
	: TEvent extends {
			(event: infer E0, listener: (...args: infer A0) => void);
			(event: string, listener: (...args: any[]) => void);
	  }
	? TransformedEvent<TThis, E0, A0>
	: TransformedEvent<TThis, string, any[]>;

/**
 * The event emitter polyfill and the node event emitter have different event types:
 * string | symbol vs. string | number
 *
 * This type allow us to correctly handle either type
 * @internal
 */
export type EventEmitterEventType = typeof EventEmitter extends {
	on(event: infer E, listener: any);
}
	? E
	: never;

/**
 * @internal
 */
export type TypedEventTransform<TThis, TEvent> =
	// Event emitter supports some special events for the emitter itself to use
	// this exposes those events for the TypedEventEmitter.
	// Since we know what the shape of these events are, we can describe them directly via a TransformedEvent
	// which easier than trying to extend TEvent directly
	TransformedEvent<
		TThis,
		"newListener" | "removeListener",
		Parameters<(event: string, listener: (...args: any[]) => void) => void>
	> &
		// Expose all the events provides by TEvent
		IEventTransformer<TThis, TEvent & IEvent> &
		// Add the default overload so this is covertable to EventEmitter regardless of environment
		TransformedEvent<TThis, EventEmitterEventType, any[]>;

/**
 * Event Emitter helper class the supports emitting typed events
 * @internal
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
