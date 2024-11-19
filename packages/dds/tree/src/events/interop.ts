/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/core-interfaces";
import type { Listeners } from "./listeners.js";
import type { UnionToIntersection } from "../util/index.js";

// TODO: this file is currently unused. Use it or remove it.

/**
 * Converts a {@link Listeners} type (i.e. the event registry for a {@link Listenable}) into a type consumable
 * by an IEventProvider from `@fluidframework/core-interfaces`.
 * @param E - the `Events` type to transform
 * @param Target - an optional `IEvent` type that will be merged into the result along with the transformed `E`
 *
 * @example
 *
 * ```typescript
 * interface MyEvents {
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }
 *
 * class MySharedObject extends SharedObject<TransformEvents<MyEvents, ISharedObjectEvents>> {
 *    // ...
 * }
 * ```
 */
export type TransformListeners<
	TListeners extends Listeners<TListeners>,
	TTarget extends IEvent = IEvent,
> = {
	[P in keyof Listeners<TListeners>]: (event: P, listener: TListeners[P]) => void;
} extends Record<string | number | symbol, infer Z>
	? UnionToIntersection<Z> & TTarget
	: never;
