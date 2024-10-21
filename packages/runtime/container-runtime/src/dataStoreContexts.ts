/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, Lazy } from "@fluidframework/core-utils/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { FluidDataStoreContext, LocalFluidDataStoreContext } from "./dataStoreContext.js";

/** @internal */
export class DataStoreContexts
	implements Iterable<[string, FluidDataStoreContext]>, IDisposable
{
	private readonly notBoundContexts = new Set<string>();

	/** Attached and loaded context proxies */
	private readonly _contexts = new Map<string, FluidDataStoreContext>();

	private readonly disposeOnce = new Lazy<void>(() => {
		// close/stop all store contexts
		for (const [fluidDataStoreId, contextD] of this._contexts) {
			try {
				contextD.dispose();
			} catch (error: unknown) {
				this._logger.sendErrorEvent(
					{
						eventName: "FluidDataStoreContextDisposeError",
						fluidDataStoreId,
					},
					error,
				);
			}
		}
	});

	private readonly _logger: ITelemetryLoggerExt;

	constructor(baseLogger: ITelemetryBaseLogger) {
		this._logger = createChildLogger({
			namespace: "FluidDataStoreContexts",
			logger: baseLogger,
		});
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
		return this.notBoundContexts.has(id) ? undefined : this._contexts.get(id);
	}

	public delete(id: string): boolean {
		this.notBoundContexts.delete(id);

		// Stash the context here in case it's requested in this session, we can log some details about it
		const context = this._contexts.get(id);
		this._recentlyDeletedContexts.set(id, context);

		return this._contexts.delete(id);
	}

	private readonly _recentlyDeletedContexts: Map<string, FluidDataStoreContext | undefined> =
		new Map();

	public getRecentlyDeletedContext(id: string) {
		return this._recentlyDeletedContexts.get(id);
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
	}

	/**
	 * Update this context as bound
	 */
	public bind(id: string) {
		const removed: boolean = this.notBoundContexts.delete(id);
		assert(removed, 0x159 /* "The given id was not found in notBoundContexts to delete" */);
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
	}
}
