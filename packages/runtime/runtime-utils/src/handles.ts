/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandleErased } from "@fluidframework/core-interfaces";
import { IFluidHandle, fluidHandleSymbol } from "@fluidframework/core-interfaces";
import type {
	IFluidHandleInternal,
	IFluidHandleInternalPayloadPending,
	IFluidHandlePayloadPending,
	ILocalFluidHandle,
} from "@fluidframework/core-interfaces/internal";

/**
 * JSON serialized form of an IFluidHandle
 * @internal
 */
export interface ISerializedHandle {
	// Marker to indicate to JSON.parse that the object is a Fluid handle
	type: "__fluid_handle__";

	// URL to the object. Relative URLs are relative to the handle context passed to the stringify.
	url: string;

	/**
	 * The handle may have a pending payload, as determined by and resolvable by the subsystem that
	 * the handle relates to.  For instance, the BlobManager uses this to distinguish blob handles
	 * which may not yet have an attached blob yet.
	 *
	 * @remarks
	 * Will only exist if the handle was created with a pending payload, will be omitted entirely from
	 * the serialized format if the handle was created with an already-shared payload.
	 */
	readonly payloadPending?: true;
}

/**
 * Is the input object a @see ISerializedHandle?
 * @internal
 */
export const isSerializedHandle = (value: any): value is ISerializedHandle =>
	value?.type === "__fluid_handle__";

/**
 * @internal
 */
export const isFluidHandleInternalPayloadPending = (
	fluidHandleInternal: IFluidHandleInternal,
): fluidHandleInternal is IFluidHandleInternalPayloadPending =>
	"payloadPending" in fluidHandleInternal && fluidHandleInternal.payloadPending === true;

/**
 * Check if the handle is an IFluidHandlePayloadPending.
 * @privateRemarks
 * This should be true for locally-created BlobHandles currently. When IFluidHandlePayloadPending is merged
 * to IFluidHandle, this type guard will no longer be necessary.
 * @legacy
 * @alpha
 */
export const isFluidHandlePayloadPending = <T>(
	handle: IFluidHandle<T>,
): handle is IFluidHandlePayloadPending<T> =>
	"payloadState" in handle &&
	(handle.payloadState === "shared" || handle.payloadState === "pending");

/**
 * Check if the handle is an ILocalFluidHandle.
 * @legacy
 * @alpha
 */
export const isLocalFluidHandle = <T>(
	handle: IFluidHandle<T>,
): handle is ILocalFluidHandle<T> =>
	isFluidHandlePayloadPending(handle) && "payloadShareError" in handle;
/**
 * Encodes the given IFluidHandle into a JSON-serializable form,
 * @param handle - The IFluidHandle to serialize.
 * @returns The serialized handle.
 *
 * @internal
 */
export function encodeHandleForSerialization(handle: IFluidHandleInternal): ISerializedHandle {
	return isFluidHandleInternalPayloadPending(handle)
		? {
				type: "__fluid_handle__",
				url: handle.absolutePath,
				payloadPending: true,
			}
		: {
				type: "__fluid_handle__",
				url: handle.absolutePath,
			};
}

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
 * Check if a value is an {@link @fluidframework/core-interfaces#IFluidHandle}.
 * @remarks
 * Objects which have a field named `IFluidHandle` can in some cases produce a false positive.
 * @public
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
 * Compare two {@link @fluidframework/core-interfaces#IFluidHandle|IFluidHandles}.
 * @remarks
 * Returns true iff both handles have the same internal `absolutePath`.
 * @public
 */
export function compareFluidHandles(a: IFluidHandle, b: IFluidHandle): boolean {
	const aInternal = toFluidHandleInternal(a);
	const bInternal = toFluidHandleInternal(b);
	return aInternal.absolutePath === bInternal.absolutePath;
}

/**
 * Downcast an IFluidHandle to an IFluidHandleInternal.
 * @legacy
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
 * @legacy
 * @alpha
 */
export function toFluidHandleErased<T>(
	handle: IFluidHandleInternal<T>,
): IFluidHandleErased<T> {
	return handle as unknown as IFluidHandleErased<T>;
}

/**
 * Base class which can be uses to assist implementing IFluidHandleInternal.
 * @legacy
 * @alpha
 */
export abstract class FluidHandleBase<T> implements IFluidHandleInternal<T> {
	public abstract absolutePath: string;
	public abstract attachGraph(): void;
	/**
	 * @deprecated No replacement provided. Arbitrary handles may not serve as a bind source.
	 */
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
