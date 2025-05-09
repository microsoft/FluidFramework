/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "./erasedType.js";
import type { IRequest, IResponse } from "./fluidRouter.js";
import type { Listenable } from "./internal.js";

/**
 * @legacy
 * @alpha
 */
export const IFluidHandleContext: keyof IProvideFluidHandleContext = "IFluidHandleContext";

/**
 * @legacy
 * @alpha
 */
export interface IProvideFluidHandleContext {
	readonly IFluidHandleContext: IFluidHandleContext;
}

/**
 * Describes a routing context from which other `IFluidHandleContext`s are defined.
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
 */
export interface IProvideFluidHandle {
	/**
	 * @deprecated {@link IFluidHandleInternal} and {@link IFluidHandleInternal} should be identified should be identified using the {@link fluidHandleSymbol} symbol.
	 * @privateRemarks
	 * This field must be kept so that code from before 2.0.0-rc.4.0.0 (When fluidHandleSymbol was added) still detects handles.
	 * This is required due to some use-cases mixing package versions.
	 * More details in packages/runtime/runtime-utils/src/handles.ts and on {@link fluidHandleSymbol}.
	 */
	readonly [IFluidHandle]: IFluidHandleInternal;
}

/**
 * Handle to a shared {@link FluidObject}.
 * @legacy
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
	 *
	 * @deprecated No replacement provided. Arbitrary handles may not serve as a bind source.
	 */
	bind(handle: IFluidHandleInternal): void;
}

/**
 * @privateRemarks
 * To be merged onto IFluidHandleInternal in accordance with breaking change policy
 * @internal
 */
export interface IFluidHandleInternalPayloadPending<
	// REVIEW: Constrain `T` to something? How do we support dds and datastores safely?
	out T = unknown, // FluidObject & IFluidLoadable,
> extends IFluidHandleInternal<T> {
	/**
	 * Whether the handle has a pending payload, meaning that it may exist before its payload is retrievable.
	 * For instance, the BlobManager can generate handles before completing the blob upload/attach.
	 */
	readonly payloadPending: boolean;
}

/**
 * The state of the handle's payload.
 * - "pending" - The payload is not shared to all collaborators
 * - "shared" - The payload is available to both the local client and remote collaborators
 *
 * @remarks
 * Clients will see a transition of "pending" to "shared" when the payload has been shared to all collaborators.
 * @legacy
 * @alpha
 */
export type PayloadState = "pending" | "shared";

/**
 * Events which fire from an IFluidHandle.
 * @legacy
 * @alpha
 */
export interface IFluidHandleEvents {
	/**
	 * Emitted when the payload becomes available to remote collaborators.
	 */
	payloadShared: () => void;
}

/**
 * Observable state on the handle regarding its payload sharing state.
 *
 * @privateRemarks
 * Contents to be merged to IFluidHandle, and then this separate interface should be removed.
 * @legacy
 * @alpha
 */
export interface IFluidHandlePayloadPending<T> extends IFluidHandle<T> {
	/**
	 * The current state of the handle's payload.
	 */
	readonly payloadState: PayloadState;
	/**
	 * Event emitter, with events that emit as the payload state transitions.
	 */
	readonly events: Listenable<IFluidHandleEvents>;
}

/**
 * Additional events which fire as a local handle's payload state transitions.
 * @legacy
 * @alpha
 */
export interface ILocalFluidHandleEvents extends IFluidHandleEvents {
	/**
	 * Emitted for locally created handles when the payload fails sharing to remote collaborators.
	 */
	payloadShareFailed: (error: unknown) => void;
}

/**
 * Additional observable state on a local handle regarding its payload sharing state.
 * @legacy
 * @alpha
 */
export interface ILocalFluidHandle<T> extends IFluidHandlePayloadPending<T> {
	/**
	 * The error encountered by the handle while sharing the payload, if one has occurred.  Undefined if no error has occurred.
	 */
	readonly payloadShareError: unknown;
	/**
	 * Event emitter, with events that emit as the payload state transitions.
	 */
	readonly events: Listenable<IFluidHandleEvents & ILocalFluidHandleEvents>;
}

/**
 * Symbol which must only be used on an {@link (IFluidHandle:interface)}, and is used to identify such objects.
 *
 * @remarks
 * To narrow arbitrary objects to handles do not simply check for this symbol:
 * instead use {@link @fluidframework/runtime-utils#isFluidHandle} which has improved compatibility
 * with older implementations of handles that may exist due to dynamic code loading of older packages.
 *
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
 * @sealed @public
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
	 *
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
 * @sealed @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IFluidHandleErased<T> extends ErasedType<readonly ["IFluidHandle", T]> {}
