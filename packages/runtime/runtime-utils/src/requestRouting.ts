/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IFluidHandleContext,
    IRequest,
    IResponse,
    IFluidObject,
    IFluidRequestHandler,
    IFluidRoutingContext,
    defaultRoutePath,
} from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";
import { generateHandleContextPath } from "./dataStoreHandleContextUtils";
import { RequestParser } from "./requestParser";

/**
 * Represents a route in request routing
 */
export class FluidRoutingContext implements IFluidRoutingContext {
    protected routes: Map<string, IFluidRequestHandler> = new Map();
    public readonly absolutePath: string;

    /**
     * Creates a new FluidHandleContext.
     * @param path - The path to this handle relative to the routeContext.
     * @param routeContext - The parent IFluidRoutingContext that has a route to this handle.
     */
    constructor(
        path: string,
        public readonly routeContext?: IFluidRoutingContext,
        protected readonly realize: () => Promise<void> = async () => Promise.resolve(),
        protected readonly requestHandler?: (request: IRequest, route?: string) => Promise<IResponse>,
    ) {
        this.absolutePath = generateHandleContextPath(path, routeContext);
        routeContext?.addRoute(path, this);
    }

    public addRoute(path: string, route: IFluidRequestHandler) {
        assert(!this.routes.has(path));
        this.routes.set(path, route);
    }

    public async request(request: IRequest): Promise<IResponse> {
        await this.realize();
        const parser = RequestParser.create(request);
        const id = parser.pathParts[0];
        const route = this.routes.get(id ?? defaultRoutePath);
        if (route !== undefined) {
            return route.request(id === undefined ? parser : parser.createSubRequest(1));
        }
        if (this.requestHandler !== undefined) {
            return this.requestHandler(request, id);
        }
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}

/**
 * Terminating route in request routing - returns IFluidObject.
 */
export class TerminatingRoute implements IFluidRoutingContext
{
    public readonly absolutePath: string;

    /**
     * Creates a new FluidHandleContext.
     * @param path - The path to this handle relative to the routeContext.
     * @param context - The parent IFluidRoutingContext that has a route to this handle.
     */
    constructor(
        path: string,
        protected readonly context: IFluidRoutingContext,
        public readonly value: () => Promise<IFluidObject>,
     ) {
        this.absolutePath = generateHandleContextPath(path, context);
        context.addRoute(path, this);
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url === "" || request.url === "/") {
            return { status: 200, mimeType: "fluid/object", value: await this.value() };
        }
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }

    public addRoute(path: string, route: IFluidRoutingContext) {
        throw new Error(`Can't add route ${path} to ${this.absolutePath}`);
    }
}

/**
 * An object that provides IFluidHandleContext has to implement this interface
 * for IFluidHandleContext to be able to control attachment flow.
 */
export interface IFluidLoadableObjectWithContext extends IFluidObject {
    readonly attachState: AttachState;
    attachGraph(): void;
}

/**
 * An adapter over IFluidRoutingContext instance that exposes IFluidHandleContext
 * Used by IFluidLoadable objects as a base for handles
 */
export class FluidHandleContext<T extends IFluidLoadableObjectWithContext>
        implements IFluidHandleContext
{
    /**
     * Creates a new FluidHandleContext.
     * @param value - object that controls attachment flows.
     * @param path - The path to this handle relative to the routeContext.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(
        protected readonly value: T,
        protected readonly context: IFluidRoutingContext,
    ) {
    }

    public attachGraph(): void {
        this.value.attachGraph();
    }

    public get isAttached() {
        return this.value.attachState !== AttachState.Detached;
    }

    // IFluidRoutingContext methods
    public get absolutePath() { return this.context.absolutePath; }
    public get routeContext() { return this.context.routeContext; }
    public async request(request: IRequest) { return this.context.request(request); }

    // back-compat for 0.35, to satisfy RemoteFluidObjectHandle.get() implementation
    public async resolveHandle(request: IRequest) { return this.request(request); }

    public addRoute(path: string, route: IFluidRoutingContext) {
        this.context.addRoute(path, route);
    }
}
