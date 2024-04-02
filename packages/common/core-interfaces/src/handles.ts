/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ErasedType } from "./erasedType.js";
import type { IRequest, IResponse } from "./fluidRouter.js";

/**
 * @public
 */
export const IFluidHandleContext: keyof IProvideFluidHandleContext = "IFluidHandleContext";

/**
 * @public
 */
export interface IProvideFluidHandleContext {
	readonly IFluidHandleContext: IFluidHandleContext;
}

/**
 * Describes a routing context from which other `IFluidHandleContext`s are defined.
 * @public
 */
export interface IFluidHandleContext extends IProvideFluidHandleContext {
	/**
	 * The absolute path to the handle context from the root.
	 */
	readonly absolutePath: string;

	/**
	 * The parent IFluidHandleContext that has provided a route path to this IFluidHandleContext or undefined
	 * at the root.
	 */
	readonly routeContext?: IFluidHandleContext;

	/**
	 * Flag indicating whether or not the entity has services attached.
	 */
	readonly isAttached: boolean;

	/**
	 * Runs through the graph and attach the bounded handles.
	 */
	attachGraph(): void;

	resolveHandle(request: IRequest): Promise<IResponse>;
}

/**
 * @public
 * @privateRemarks
 * This really should be deprecated and alpha, but since its a merged export with the public interface,
 * it can't have its own docs or different tags.
 */
export const IFluidHandle = "IFluidHandle";

/**
 * @deprecated {@link IFluidHandleInternal} and {@link IFluidHandleInternal} should be identified should be identified using the {@link fluidHandleSymbol} symbol.
 * @alpha
 */
export interface IProvideFluidHandle {
	/**
	 * @deprecated {@link IFluidHandleInternal} and {@link IFluidHandleInternal} should be identified should be identified using the {@link fluidHandleSymbol} symbol.
	 */
	readonly [IFluidHandle]: IFluidHandleInternal;
}

/**
 * Handle to a shared {@link FluidObject}.
 * @alpha
 */
export interface IFluidHandleInternal<
	// REVIEW: Constrain `T` to something? How do we support dds and datastores safely?
	out T = unknown, // FluidObject & IFluidLoadable,
> extends IFluidHandle<T>,
		IProvideFluidHandle {
	/**
	 * The absolute path to the handle context from the root.
	 */
	readonly absolutePath: string;

	/**
	 * Runs through the graph and attach the bounded handles.
	 */
	attachGraph(): void;

	/**
	 * Binds the given handle to this one or attach the given handle if this handle is attached.
	 * A bound handle will also be attached once this handle is attached.
	 */
	bind(handle: IFluidHandleInternal): void;
}

/**
 * Symbol which must only be used on {@link FluidObject}, and is used to identify such objects.
 * @privateRemarks
 * Normally `Symbol` would be used here instead of `Symbol.for` since just using Symbol (and avoiding the global symbol registry) removes the risk of collision, which is the main point of using a symbol for this in the first place.
 * In this case however, some users of this library do dynamic code loading, and can end up with multiple versions of packages, and mix data from one version with another.
 * Using the global symbol registry allows duplicate copies of this library to share a single symbol, though reintroduces the risk of collision, which is mitigated via the use of a UUIDv4 randomly generated when this code was authored:
 * @public
 */
export const fluidHandleSymbol: unique symbol = Symbol.for(
	"FluidHandle-3978c7cf-4675-49ba-a20c-bf35efbf43da",
);

/**
 * Handle to a shared {@link FluidObject}.
 * @public
 */
export interface IFluidHandle<out T = unknown> {
	/**
	 * Flag indicating whether or not the entity has services attached.
	 */
	readonly isAttached: boolean;

	/**
	 * Returns a promise to the Fluid Object referenced by the handle.
	 */
	get(): Promise<T>;

	/**
	 * Symbol used to mark an object as a {@link (IFluidHandle:interface)}
	 * and to recover the underlying handle implementation.
	 * @privateRemarks
	 * Used to recover {@link IFluidHandleInternal}, see {@link toFluidHandleInternal}.
	 */
	readonly [fluidHandleSymbol]: IFluidHandleErased<T>;
}

/**
 * A type erased Fluid Handle.
 * These can only be produced by the Fluid Framework and provide the implementation details needed to power {@link (IFluidHandle:interface)}.
 * @privateRemarks
 * Created from {@link IFluidHandleInternal} using {@link toFluidHandleErased}.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IFluidHandleErased<T> extends ErasedType<readonly ["IFluidHandle", T]> {}

/**
 * Downcast an IFluidHandle to an IFluidHandleInternal.
 * @alpha
 */
export function toFluidHandleInternal<T>(handle: IFluidHandle<T>): IFluidHandleInternal<T> {
	if (!(fluidHandleSymbol in handle) || !(fluidHandleSymbol in handle[fluidHandleSymbol])) {
		throw new TypeError("Invalid IFluidHandle");
	}

	// This casts the IFluidHandleErased from the symbol instead of `handle` to ensure that if someone
	// implements their own IFluidHandle in terms of an existing handle, it won't break anything.
	return handle[fluidHandleSymbol] as unknown as IFluidHandleInternal<T>;
}

/**
 * Type erase IFluidHandleInternal for use with {@link fluidHandleSymbol}.
 * @alpha
 */
export function toFluidHandleErased<T>(handle: IFluidHandleInternal<T>): IFluidHandleErased<T> {
	return handle as unknown as IFluidHandleErased<T>;
}
