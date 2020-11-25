/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, Deferred, Lazy } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { FluidDataStoreContext, LocalFluidDataStoreContext } from "./dataStoreContext";

 export class DataStoreContexts implements Iterable<[string,FluidDataStoreContext]>, IDisposable {
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

    private readonly disposeOnce = new Lazy<void>(()=>{
        // close/stop all store contexts
        for (const [fluidDataStoreId, contextD] of this.deferredContexts) {
            contextD.promise.then((context) => {
                context.dispose();
            }).catch((contextError) => {
                this._logger.sendErrorEvent({
                    eventName: "FluidDataStoreContextDisposeError",
                    fluidDataStoreId,
                },
                contextError);
            });
        }
    });

    private readonly _logger: ITelemetryLogger;

    constructor(baseLogger: ITelemetryBaseLogger) {
        this._logger = ChildLogger.create(baseLogger);
    }

    [Symbol.iterator](): Iterator<[string, FluidDataStoreContext]> {
         return this._contexts.entries();
     }

    public get disposed() { return this.disposeOnce.evaluated;}
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

    /**
     * Prepare and return the unbound context with the given id so it can be bound.
     */
    public prepContextForBind(id: string): LocalFluidDataStoreContext {
        assert(this.notBoundContexts.has(id), "Store being bound should be in not bounded set");
        assert(this._contexts.has(id), "Attempting to bind to a context that hasn't been added yet");

        this.notBoundContexts.delete(id);
        return this._contexts.get(id) as LocalFluidDataStoreContext;
    }

    /**
     * Add the given context, marking it as to-be-bound
     */
    public addUnbound(context: LocalFluidDataStoreContext) {
        const id = context.id;
        assert(!this._contexts.has(id), "Creating store with existing ID");

        this._contexts.set(id, context);

        this.notBoundContexts.add(id);
        this.ensureDeferred(id);
    }

    /**
     * This returns a Promise that will resolve when a context with the given id is bound,
     * or added as remote from another client.
     * @param id The id of the context to await
     */
    public async waitForContext(id: string): Promise<FluidDataStoreContext> {
        return this.ensureDeferred(id).promise;
    }

    private ensureDeferred(id: string): Deferred<FluidDataStoreContext> {
        const deferred = this.deferredContexts.get(id);
        if (deferred) { return deferred; }

        const newDeferred = new Deferred<FluidDataStoreContext>();
        this.deferredContexts.set(id, newDeferred);
        return newDeferred;
    }

    /**
     * Indicates the context has been bound
     */
    public notifyOnBind(id: string) {
        this.resolveDeferred(id);
    }

    /**
     * Triggers the deferred to resolve, indicating the context is not local-only
     * @param id - The id of the context to resolve to
     */
    private resolveDeferred(id: string) {
        const context = this._contexts.get(id);
        assert(!!context, "Cannot find context to resolve to");
        assert(!this.notBoundContexts.has(id), "Expected this id to already be removed from notBoundContexts");

        const deferred = this.deferredContexts.get(id);
        assert(!!deferred, "Cannot find deferred to resolve");
        deferred.resolve(context);
    }

    /**
     * Add the given context, marking it as not local-only.
     * This could be because it's a local context that's been bound, or because it's a remote context.
     * @param context - The context to add
     */
    public addBoundOrRemote(context: FluidDataStoreContext) {
        const id = context.id;
        assert(!this._contexts.has(id), "Creating store with existing ID");

        this._contexts.set(id, context);

        // Resolve the deferred immediately since this context is not unbound
        this.ensureDeferred(id);
        this.resolveDeferred(id);
    }
}
