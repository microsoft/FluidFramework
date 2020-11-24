/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, Deferred, Lazy } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { FluidDataStoreContext } from "./dataStoreContext";

 export class DataStoreContexts implements Iterable<[string,FluidDataStoreContext]>, IDisposable {
    private readonly notBoundContexts = new Set<string>();

    /** Attached and loaded context proxies */
    private readonly _contexts = new Map<string, FluidDataStoreContext>();

    /**
     * List of pending context needing to be bound, for the case where a client
     * knows a store will exist and is waiting on its creation.
     * This is a superset of contexts.
     * Each deferred bind completes when the context exists in _contexts and is bound
     */
    private readonly deferredContextBinds = new Map<string, Deferred<FluidDataStoreContext>>();

    private readonly disposeOnce = new Lazy<void>(()=>{
        // close/stop all store contexts
        for (const [fluidDataStoreId, contextD] of this.deferredContextBinds) {
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

    /**
     * When a context of the given id is about to be bound/attached, call this to update internal tracking
     */
    public notifyOnBeforeBind(id: string) {
        assert(this.notBoundContexts.has(id), "Store being bound should be in not bounded set");
        this.notBoundContexts.delete(id);
    }

    /**
     * Add the given context, marking it as to-be-bound
     */
    public addUnboundContext(context: FluidDataStoreContext) {
        const id = context.id;
        assert(!this._contexts.has(id), "Creating store with existing ID");

        this._contexts.set(id, context);

        this.notBoundContexts.add(id);
        this.prepDeferredBind(id);
    }

    /**
     * This returns a Deferred that will resolve when a context with the given id is bound.
     * We may or may not have this context locally already.
     * @param id The id of the context to defer binding on
     */
    public prepDeferredBind(id: string): Deferred<FluidDataStoreContext> {
        const deferred = this.deferredContextBinds.get(id);
        if (deferred) { return deferred; }

        const newDeferred = new Deferred<FluidDataStoreContext>();
        this.deferredContextBinds.set(id, newDeferred);
        return newDeferred;
    }

    /**
     * Triggers the deferred to resolve, indicating the context has been bound
     * @param id - The id of the newly-bound context
     * @param context - The context (Redundant with existing context that was previously set)
     */
    public resolveDeferredBind(id: string, context: FluidDataStoreContext) {
        assert(this._contexts.get(id) === context, "id mismatch for context being bound");
        const deferredBind = this.deferredContextBinds.get(id);
        assert(!!deferredBind, "Cannot find deferredBind");
        deferredBind.resolve(context);
    }

    /**
     * Add the given context, marking it as bound
     * @param id - id of context to add. Redundant with context.id
     * @param context - The context to add
     */
    public addBoundContext(id: string, context: FluidDataStoreContext) {
        assert(id === context.id, "id mismatch for context being added");
        assert(!this._contexts.has(id), "Creating store with existing ID");

        this._contexts.set(id, context);

        // Resolve the deferred immediately since this context is already bound
        const deferredBind = this.prepDeferredBind(id);
        deferredBind.resolve(context);
    }

    public get(id: string): FluidDataStoreContext {
        const context = this._contexts.get(id);
        assert(!!context);
        return context;
    }

    public tryGet(id: string): FluidDataStoreContext | undefined {
        return this._contexts.get(id);
    }
 }
