/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDisposable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, Deferred, Lazy } from "@fluidframework/core-utils/internal";
import {
	type ITelemetryLoggerExt,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import type { FluidDataStoreContext, LocalFluidDataStoreContext } from "./dataStoreContext.js";

/**
 * Manages the collection of data store contexts, tracking their bound/unbound state.
 *
 * @remarks
 * A context is "unbound" when it's created locally but not yet made visible (reachable from root).
 * A context is "bound" once it's made locally visible, regardless of the Container's attach state.
 * In attached containers, binding a context immediately sends an attach op and transitions it to Attaching state.
 *
 * @internal
 */
export class DataStoreContexts
	implements Iterable<[string, FluidDataStoreContext]>, IDisposable
{
	/**
	 * Set of IDs for contexts that are unbound (not yet made locally visible).
	 * These contexts exist locally but aren't known to other clients (even in an attached container).
	 */
	private readonly notBoundContexts = new Set<string>();

	/**
	 * Map of all data store contexts (both bound and unbound).
	 */
	private readonly _contexts = new Map<string, FluidDataStoreContext>();

	/**
	 * List of pending context waiting either to be bound or to arrive from another client.
	 * This covers the case where a local context has been created but not yet bound,
	 * or the case where a client knows a store will exist (e.g. by alias) and is waiting on its creation,
	 * so that a caller may await the deferred's promise until such a time as the context is fully ready.
	 * This is a superset of _contexts, since contexts remain here once the Deferred resolves.
	 */
	private readonly deferredContexts = new Map<string, Deferred<FluidDataStoreContext>>();

	/**
	 * Lazy disposal logic that disposes all contexts when called.
	 */
	// eslint-disable-next-line unicorn/consistent-function-scoping -- Property is defined once; no need to extract inner lambda
	private readonly disposeOnce = new Lazy<void>(() => {
		// close/stop all store contexts
		for (const [fluidDataStoreId, contextD] of this.deferredContexts) {
			contextD.promise
				.then((context) => {
					context.dispose();
				})
				.catch((contextError) => {
					this._logger.sendErrorEvent(
						{
							eventName: "FluidDataStoreContextDisposeError",
							fluidDataStoreId,
						},
						contextError,
					);
				});
		}
	});

	private readonly _logger: ITelemetryLoggerExt;

	constructor(baseLogger: ITelemetryBaseLogger) {
		this._logger = createChildLogger({ logger: baseLogger });
	}

	[Symbol.iterator](): Iterator<[string, FluidDataStoreContext]> {
		return this._contexts.entries();
	}

	public get size(): number {
		return this._contexts.size;
	}

	public get disposed(): boolean {
		return this.disposeOnce.evaluated;
	}
	public readonly dispose = (): void => this.disposeOnce.value;

	/**
	 * Returns the count of unbound contexts (i.e. local-only on this client)
	 */
	public notBoundLength(): number {
		return this.notBoundContexts.size;
	}

	/**
	 * Returns true if the given ID corresponds to an unbound context. (i.e. local-only on this client)
	 */
	public isNotBound(id: string): boolean {
		return this.notBoundContexts.has(id);
	}

	/**
	 * Returns true if a context with the given ID exists (bound or unbound).
	 */
	public has(id: string): boolean {
		return this._contexts.has(id);
	}

	/**
	 * Returns the context with the given ID, or undefined if not found.
	 * This returns both bound and unbound contexts.
	 */
	public get(id: string): FluidDataStoreContext | undefined {
		return this._contexts.get(id);
	}

	/**
	 * Deletes the context with the given ID from all internal maps.
	 * @returns True if the context was found and deleted, false otherwise.
	 */
	public delete(id: string): boolean {
		this.deferredContexts.delete(id);
		this.notBoundContexts.delete(id);

		// Stash the context here in case it's requested in this session, we can log some details about it
		const context = this._contexts.get(id);
		this._recentlyDeletedContexts.set(id, context);

		return this._contexts.delete(id);
	}

	/**
	 * Map of recently deleted contexts for diagnostic purposes for GC.
	 * Allows retrieval of context information even after deletion for logging/telemetry.
	 */
	private readonly _recentlyDeletedContexts: Map<string, FluidDataStoreContext | undefined> =
		new Map();

	/**
	 * Returns a recently deleted context by ID, or undefined if not found.
	 * Used for diagnostic logging for GC, when a deleted context is referenced.
	 */
	public getRecentlyDeletedContext(id: string): FluidDataStoreContext | undefined {
		return this._recentlyDeletedContexts.get(id);
	}

	/**
	 * Returns the unbound local context with the given ID.
	 * @returns The unbound context, or undefined if not found or not unbound.
	 */
	public getUnbound(id: string): LocalFluidDataStoreContext | undefined {
		const context = this._contexts.get(id);
		if (context === undefined || !this.notBoundContexts.has(id)) {
			return undefined;
		}

		return context as LocalFluidDataStoreContext;
	}

	/**
	 * Adds the given context to the collection, marking it as unbound (not yet locally visible).
	 * Asserts that no context with this ID already exists.
	 */
	public addUnbound(context: LocalFluidDataStoreContext): void {
		const id = context.id;
		assert(!this._contexts.has(id), 0x158 /* "Creating store with existing ID" */);

		this._contexts.set(id, context);

		this.notBoundContexts.add(id);
		this.ensureDeferred(id);
	}

	/**
	 * Get the context with the given id, once it exists locally and is attached.
	 * e.g. If created locally, it must be bound, or if created remotely then it's fine as soon as it's sync'd in.
	 * @param id - The id of the context to get
	 * @param wait - If false, return undefined if the context isn't present and ready now. Otherwise, wait for it.
	 */
	public async getBoundOrRemoted(
		id: string,
		wait: boolean,
	): Promise<FluidDataStoreContext | undefined> {
		const deferredContext = this.ensureDeferred(id);

		if (!wait && !deferredContext.isCompleted) {
			return undefined;
		}

		return deferredContext.promise;
	}

	/**
	 * Gets or creates a deferred promise for the given context ID.
	 * Used to allow waiting for contexts that don't exist yet.
	 */
	private ensureDeferred(id: string): Deferred<FluidDataStoreContext> {
		const deferred = this.deferredContexts.get(id);
		if (deferred) {
			return deferred;
		}

		const newDeferred = new Deferred<FluidDataStoreContext>();
		this.deferredContexts.set(id, newDeferred);
		return newDeferred;
	}

	/**
	 * Marks the context with the given ID as bound (locally visible).
	 * Removes it from the unbound set and resolves its deferred promise.
	 */
	public bind(id: string): void {
		const removed: boolean = this.notBoundContexts.delete(id);
		assert(removed, 0x159 /* "The given id was not found in notBoundContexts to delete" */);

		this.resolveDeferred(id);
	}

	/**
	 * Triggers the deferred to resolve, indicating the context is not local-only
	 * @param id - The id of the context to resolve to
	 */
	private resolveDeferred(id: string): void {
		const context = this._contexts.get(id);
		assert(!!context, 0x15a /* "Cannot find context to resolve to" */);
		assert(
			!this.notBoundContexts.has(id),
			0x15b /* "Expected this id to already be removed from notBoundContexts" */,
		);

		const deferred = this.deferredContexts.get(id);
		assert(!!deferred, 0x15c /* "Cannot find deferred to resolve" */);
		deferred.resolve(context);
	}

	/**
	 * Adds the given context to the collection as already bound or from a remote client.
	 * This is used when:
	 * - Adding a local context that's already been bound via the bind() method, OR
	 * - Adding a remote context that was created by another client.
	 * The context's deferred promise is resolved immediately.
	 */
	public addBoundOrRemoted(context: FluidDataStoreContext): void {
		const id = context.id;
		assert(!this._contexts.has(id), 0x15d /* "Creating store with existing ID" */);

		this._contexts.set(id, context);

		// Resolve the deferred immediately since this context is not unbound
		this.ensureDeferred(id);
		this.resolveDeferred(id);
	}
}
