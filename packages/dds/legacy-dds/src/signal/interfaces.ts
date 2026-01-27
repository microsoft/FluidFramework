/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	ISharedObject,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Basic types for the SharedSignal DDS
 * It can be used as a generic constraint (`extends SerializableTypeForSharedSignal`) but is
 * *never* meant to be a concrete/real type on its own.
 * @legacy @beta
 */
export type SerializableTypeForSharedSignal =
	| boolean
	| number
	| string
	| IFluidHandle
	| object;

/**
 * @legacy @beta
 */
export interface ISharedSignalEvents<T extends SerializableTypeForSharedSignal>
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	extends ISharedObjectEvents {
	/* eslint-disable-next-line @typescript-eslint/no-explicit-any
-- TODO: Using 'any' type defeats the purpose of TypeScript. Consider replacing it with a concrete type, or 'unknown'. */
	(event: "notify", listener: (value: T, isLocal: boolean) => void): any;
}

/**
 * @legacy @beta
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ISharedSignal<T extends SerializableTypeForSharedSignal = any>
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
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
