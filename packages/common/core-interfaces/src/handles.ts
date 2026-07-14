/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "./erasedType.js";
import type { IRequest, IResponse } from "./fluidRouter.js";
import type { Listenable } from "./internal.js";

/**
 * @legacy @beta
 */
export const IFluidHandleContext: keyof IProvideFluidHandleContext = "IFluidHandleContext";

/**
 * @legacy @beta
 */
export interface IProvideFluidHandleContext {
	readonly IFluidHandleContext: IFluidHandleContext;
}

/**
 * Describes a routing context from which other `IFluidHandleContext`s are defined.
 * @legacy @beta
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
 * @legacy @beta
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
 * @legacy @beta
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
 * The sharing state of a handle's payload.
 *
 * - "pending" - The payload may not yet be available to all collaborators. The handle already exists, and
 *   a client that already holds the payload locally (such as its creator) can resolve it immediately. A
 *   client that does not (such as a remote collaborator, or one that received the serialized handle) will
 *   instead wait when resolving it until the payload becomes "shared", rather than failing - and that wait
 *   can be indefinite if the payload never becomes shared (for example, if the client that created it
 *   failed to upload it and then left the session).
 * - "shared" - The payload is available to both the local client and remote collaborators, so the
 *   handle can be resolved by anyone.
 *
 * @remarks
 * A handle only ever starts in the "pending" state if it was created with a _pending payload_ - that
 * is, if the creating API intentionally hands back the handle _before_ its payload has been uploaded
 * and shared. Blob handles created via `uploadBlob` when the container runtime's `createBlobPayloadPending`
 * option is enabled are the primary example.
 *
 * When a payload is _not_ created as pending (the default), the creating API does not return the
 * handle until the payload has already been uploaded and shared. Such a handle is "shared" from the moment
 * its creator receives it and never transitions. Consequently, a "pending" to "shared" transition (and the
 * corresponding {@link IFluidHandleEvents.payloadShared} event) is only ever observed for pending-payload
 * handles.
 * @legacy @beta
 */
export type PayloadState = "pending" | "shared";

/**
 * Events which fire from an {@link (IFluidHandle:interface)} as its payload sharing state transitions.
 *
 * @remarks
 * These events are only relevant for handles created with a pending payload (see {@link PayloadState} for
 * what makes a handle pending-payload, and {@link IFluidHandlePayloadPending} for how to detect one). A
 * handle whose payload was not created as pending is already "shared" when returned to its creator, so it
 * never transitions and never emits these events.
 * @legacy @beta
 */
export interface IFluidHandleEvents {
	/**
	 * Emitted when the handle's payload transitions from "pending" to "shared" - i.e. when the payload
	 * becomes available to remote collaborators (and thus resolvable by any client).
	 *
	 * @remarks
	 * This event only ever fires for handles created with a pending payload (see {@link PayloadState}). A
	 * handle whose payload was not created as pending is already "shared" when its creator receives it, so
	 * it never transitions and this event never fires for it.
	 *
	 * This lives on the base handle events (rather than {@link ILocalFluidHandleEvents}) because "shared"
	 * describes the payload's availability to _everyone_, not a purely local concern: it is meaningful
	 * both to the local client that created the pending payload and to a remote client that received the
	 * still-pending handle and is waiting for its payload to become resolvable.
	 *
	 * Resolving (calling `get()` on) a handle before it is "shared" does not fail merely because the payload
	 * is still pending, and what it does depends on who is resolving it:
	 *
	 * - The client that created the pending payload already holds it locally, so its `get()` resolves
	 *   immediately regardless of the payload state - it does not need to wait for this event.
	 * - A client that does not hold the payload locally (such as a remote collaborator, or one that received
	 *   the serialized handle) instead waits inside `get()` until the payload becomes "shared". That wait can
	 *   be indefinite if the payload never becomes shared - for example, if the client that created it failed
	 *   to upload it and then left the session.
	 *
	 * This event is the signal such a waiting client is (implicitly) blocked on, so it can be used to
	 * observe availability without holding an open `get()` call.
	 */
	payloadShared: () => void;
}

/**
 * Observable state on a handle regarding its payload sharing state.
 *
 * @remarks
 * A handle only surfaces this state when it may exist before its payload is retrievable - i.e. when it was
 * created with a pending payload (for example, blobs uploaded via `uploadBlob` with the container runtime's
 * `createBlobPayloadPending` option enabled). Use
 * {@link @fluidframework/runtime-utils#isFluidHandlePayloadPending} to detect such handles. Handles created
 * without a pending payload are already "shared" when returned and expose no meaningful transition; see
 * {@link PayloadState}.
 *
 * @privateRemarks
 * Contents to be merged to IFluidHandle, and then this separate interface should be removed.
 * @legacy @beta
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
 * Additional events which fire as a _locally-created_ handle's payload sharing state transitions.
 *
 * @remarks
 * These events describe the payload-sharing _process_ as performed by the client that created the
 * payload - uploading it to storage, then sharing it to remote collaborators. They are therefore only
 * relevant for handles that _this_ client created with a pending payload, for example blobs uploaded
 * via `uploadBlob` when the container runtime's `createBlobPayloadPending` option is enabled. Use
 * {@link @fluidframework/runtime-utils#isLocalFluidHandle} to detect such handles.
 *
 * These events never fire in two cases:
 *
 * - A handle created _without_ a pending payload finishes uploading and sharing before it is returned
 *   to its creator, so neither these events nor the base {@link IFluidHandleEvents.payloadShared} ever fire.
 * - A remote client that merely received a pending-payload handle does not run the sharing process, so it
 *   only observes the base {@link IFluidHandleEvents.payloadShared} milestone, not these local-only events.
 * @legacy @beta
 */
export interface ILocalFluidHandleEvents extends IFluidHandleEvents {
	/**
	 * Emitted for locally created handles when the payload has been uploaded to storage, but before it
	 * is shared to remote collaborators.
	 *
	 * @remarks
	 * This is a local-only milestone that precedes {@link IFluidHandleEvents.payloadShared}. For instance,
	 * the BlobManager uploads a blob to storage and only afterwards sends the BlobAttach op (which requires
	 * a connection) that shares it to remote collaborators. This event lets the local client observe upload
	 * completion without waiting for the payload to be shared - for example, to wait for all pending blob
	 * uploads to finish before connecting. Like the rest of {@link ILocalFluidHandleEvents}, it only fires
	 * for handles created with a pending payload.
	 *
	 * Note that this event is not guaranteed to fire before {@link IFluidHandleEvents.payloadShared}. A
	 * handle may transition directly to shared (skipping an observable upload) - for instance when loading
	 * from pending state and observing the BlobAttach op from the client that generated that state.
	 *
	 * When this event fires while the container is disconnected (that is, the upload both started and
	 * completed before reconnecting), the payload's attach op is guaranteed to be ordered ahead of any ops
	 * produced during that same disconnected period - including the DDS changes that stored this handle -
	 * because pending attach ops are flushed before other pending ops on reconnect. As a result, remote
	 * clients process those DDS changes only after the payload is already available to them, and so never
	 * observe this handle in its pre-"shared" (not-yet-resolvable) state through those changes. This does
	 * not hold for changes made while connected, which may be sequenced before the payload's attach op.
	 */
	payloadUploaded: () => void;
	/**
	 * Emitted for locally created handles when sharing the payload to remote collaborators fails - for
	 * example, when the blob upload or its subsequent attach op could not be completed.
	 *
	 * @remarks
	 * Like the rest of {@link ILocalFluidHandleEvents}, this only fires for handles created with a pending
	 * payload. The associated error is also available via {@link ILocalFluidHandle.payloadShareError}.
	 */
	payloadShareFailed: (error: unknown) => void;
}

/**
 * Additional observable state on a _locally-created_ handle regarding its payload sharing state. Like
 * {@link ILocalFluidHandleEvents}, this is only meaningful for handles created with a pending payload.
 * @legacy @beta
 */
export interface ILocalFluidHandle<T> extends IFluidHandlePayloadPending<T> {
	/**
	 * The error encountered by the handle while sharing the payload, if one has occurred; otherwise
	 * undefined. Only ever set for pending-payload handles (see {@link ILocalFluidHandleEvents}).
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
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IFluidHandleErased<T> extends ErasedType<readonly ["IFluidHandle", T]> {}
