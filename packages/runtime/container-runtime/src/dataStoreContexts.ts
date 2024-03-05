/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Deferred, Lazy } from "@fluidframework/core-utils";
import { IDisposable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { createChildLogger, ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { FluidDataStoreContext, LocalFluidDataStoreContext } from "./dataStoreContext.js";

export class DataStoreContexts implements Iterable<[string, FluidDataStoreContext]>, IDisposable {
	private readonly notBoundContexts = new Set<string>();

	/** Attached and loaded context proxies */
	private readonly _contexts = new Map<string, FluidDataStoreContext>();

	/**
	 * List of pending context waiting either to be bound or to arrive from another client.
	 * This covers the case where a local context has been created but not yet bound,
	 * or the case where a client knows a store will exist and is waiting on its creation,
	 * so that a caller may await the deferred's promise until such a time as the context is fully ready.
	 * This is a superset of _contexts, since contexts remain here once the Deferred resolves.
	 */
	private readonly deferredContexts = new Map<string, Deferred<FluidDataStoreContext>>();

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

	public get disposed() {
		return this.disposeOnce.evaluated;
	}
	public readonly dispose = () => this.disposeOnce.value;

	public notBoundLength() {
		return this.notBoundContexts.size;
	}

	public isNotBound(id: string) {
		return this.notBoundContexts.has(id);
	}

	public has(id: string) {
		return this._contexts.has(id);
	}

	public get(id: string): FluidDataStoreContext | undefined {
		return this._contexts.get(id);
	}

	public delete(id: string): boolean {
		this.deferredContexts.delete(id);
		this.notBoundContexts.delete(id);
		return this._contexts.delete(id);
	}

	/**
	 * Return the unbound local context with the given id,
	 * or undefined if it's not found or not unbound.
	 */
	public getUnbound(id: string): LocalFluidDataStoreContext | undefined {
		const context = this._contexts.get(id);
		if (context === undefined || !this.notBoundContexts.has(id)) {
			return undefined;
		}

		return context as LocalFluidDataStoreContext;
	}

	/**
	 * Add the given context, marking it as to-be-bound
	 */
	public addUnbound(context: LocalFluidDataStoreContext) {
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
	 * Update this context as bound
	 */
	public bind(id: string) {
		const removed: boolean = this.notBoundContexts.delete(id);
		assert(removed, 0x159 /* "The given id was not found in notBoundContexts to delete" */);

		this.resolveDeferred(id);
	}

	/**
	 * Triggers the deferred to resolve, indicating the context is not local-only
	 * @param id - The id of the context to resolve to
	 */
	private resolveDeferred(id: string) {
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
	 * Add the given context, marking it as not local-only.
	 * This could be because it's a local context that's been bound, or because it's a remote context.
	 * @param context - The context to add
	 */
	public addBoundOrRemoted(context: FluidDataStoreContext) {
		const id = context.id;
		assert(!this._contexts.has(id), 0x15d /* "Creating store with existing ID" */);

		this._contexts.set(id, context);

		// Resolve the deferred immediately since this context is not unbound
		this.ensureDeferred(id);
		this.resolveDeferred(id);
	}
}
