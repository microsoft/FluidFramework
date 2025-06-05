/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Basic types for the SharedSignal DDS
 * It can be used as a generic constraint (`extends SerializableTypeForSharedSignal`) but is
 * *never* meant to be a concrete/real type on its own.
 * @internal
 */
export type SerializableTypeForSharedSignal =
	| boolean
	| number
	| string
	| IFluidHandle
	| object;

/**
 * @internal
 */
export interface ISharedSignalEvents<T extends SerializableTypeForSharedSignal>
	extends ISharedObjectEvents {
	/* eslint-disable-next-line @typescript-eslint/no-explicit-any
-- TODO: Using 'any' type defeats the purpose of TypeScript. Consider replacing it with a concrete type, or 'unknown'. */
	(event: "notify", listener: (value: T) => void): any;
}

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ISharedSignal<T extends SerializableTypeForSharedSignal = any>
	extends ISharedObject<ISharedSignalEvents<T>> {
	notify(metadata?: T): void;
}

/**
 * @internal
 */
export interface ISignalOperation<out T = unknown> {
	type: "signal";
	readonly metadata?: T;
}
