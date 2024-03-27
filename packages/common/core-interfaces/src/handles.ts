/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Brand, type Erased, brandErased, fromErased } from "./brand.js";
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
	 * Flag indicating whether or not the entity has services attached.
	 */
	readonly isAttached: boolean;

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
 * @public
 */
export const fluidHandleSymbol: unique symbol = Symbol("fluidHandle");

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
	 * Symbol used to mark an object as a {@link (IFluidHandle:interface)}.
	 * @privateRemarks
	 * Used to recover {@link IFluidHandleInternal}, see {@link toInternal}.
	 */
	readonly [fluidHandleSymbol]: IFluidHandleErased<T>;
}

type HandleBrand<T> = Brand<IFluidHandleInternal<T>, IFluidHandleErased<T>>;

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IFluidHandleErased<T> extends Erased<readonly ["IFluidHandle", T]> {}

/**
 * Upcast a IFluidHandle to IFluidHandleInternal.
 * @alpha
 */
export function toFluidHandleInternal<T>(handle: IFluidHandle<T>): IFluidHandleInternal<T> {
	return fromErased<HandleBrand<T>>(handle[fluidHandleSymbol]);
}

/**
 * Type erase IFluidHandleInternal for use with {@link fluidHandleSymbol}.
 * @alpha
 */
export function toFluidHandleErased<T>(handle: IFluidHandleInternal<T>): IFluidHandleErased<T> {
	return brandErased<HandleBrand<T>>(handle);
}
