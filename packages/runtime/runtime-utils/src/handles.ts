/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandleErased } from "@fluidframework/core-interfaces";
import { IFluidHandle, fluidHandleSymbol } from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";

/**
 * JSON serialized form of an IFluidHandle
 * @internal
 */
export interface ISerializedHandle {
	// Marker to indicate to JSON.parse that the object is a Fluid handle
	type: "__fluid_handle__";

	// URL to the object. Relative URLs are relative to the handle context passed to the stringify.
	url: string;
}

/**
 * Is the input object a @see ISerializedHandle?
 * @internal
 */
export const isSerializedHandle = (value: any): value is ISerializedHandle =>
	value?.type === "__fluid_handle__";

/**
 * Setting to opt into compatibility with handles from before {@link fluidHandleSymbol} existed (Fluid Framework client 2.0.0-rc.3.0.0 and earlier).
 *
 * Some code which uses this library might dynamically load multiple versions of it,
 * as well as old or duplicated versions of packages which produce or implement handles.
 * To correctly interoperate with this old packages and object produced by them, the old in-memory format for handles, without the symbol, are explicitly supported.
 *
 * This setting mostly exists as a way to easily find any code that only exists to provide this compatibility and clarify how to remove that compatibility.
 * At some point this might be removed or turned into an actual configuration option, but for now its really just documentation.
 */
const enableBackwardsCompatibility = true;

/**
 * Check if a value is an IFluidHandle.
 * @remarks
 * Objects which have a field named `IFluidHandle` can in some cases produce a false positive.
 * @internal
 */
export function isFluidHandle(value: unknown): value is IFluidHandle {
	// `in` gives a type error on non-objects and null, so filter them out
	if (typeof value !== "object" || value === null) {
		return false;
	}
	if (fluidHandleSymbol in value) {
		return true;
	}
	// If enableBackwardsCompatibility, run check for FluidHandles predating use of fluidHandleSymbol.
	if (enableBackwardsCompatibility && IFluidHandle in value) {
		// Since this check can have false positives, make it a bit more robust by checking value[IFluidHandle][IFluidHandle]
		const inner = value[IFluidHandle] as IFluidHandle;
		if (typeof inner !== "object" || inner === null) {
			return false;
		}
		return IFluidHandle in inner;
	}
	return false;
}

/**
 * Downcast an IFluidHandle to an IFluidHandleInternal.
 * @alpha
 */
export function toFluidHandleInternal<T>(handle: IFluidHandle<T>): IFluidHandleInternal<T> {
	if (!(fluidHandleSymbol in handle) || !(fluidHandleSymbol in handle[fluidHandleSymbol])) {
		if (enableBackwardsCompatibility && IFluidHandle in handle) {
			return handle[IFluidHandle] as IFluidHandleInternal<T>;
		}
		throw new TypeError("Invalid IFluidHandle");
	}

	// This casts the IFluidHandleErased from the symbol instead of `handle` to ensure that if someone
	// implements their own IFluidHandle in terms of an existing handle, it won't break anything.
	return handle[fluidHandleSymbol] as unknown as IFluidHandleInternal<T>;
}

/**
 * Type erase IFluidHandleInternal for use with {@link @fluidframework/core-interfaces#fluidHandleSymbol}.
 * @alpha
 */
export function toFluidHandleErased<T>(handle: IFluidHandleInternal<T>): IFluidHandleErased<T> {
	return handle as unknown as IFluidHandleErased<T>;
}

/**
 * Base class which can be uses to assist implementing IFluidHandleInternal.
 * @alpha
 */
export abstract class FluidHandleBase<T> implements IFluidHandleInternal<T> {
	public abstract absolutePath: string;
	public abstract attachGraph(): void;
	public abstract bind(handle: IFluidHandleInternal): void;
	public abstract readonly isAttached: boolean;
	public abstract get(): Promise<T>;

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IProvideFluidHandle.IFluidHandle}
	 */
	public get IFluidHandle(): IFluidHandleInternal {
		return this;
	}

	public get [fluidHandleSymbol](): IFluidHandleErased<T> {
		return toFluidHandleErased(this);
	}
}
