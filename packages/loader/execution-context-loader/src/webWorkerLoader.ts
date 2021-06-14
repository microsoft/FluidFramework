/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails,
    IFluidRouter,
    IFluidRunnable,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { IContainer, IHostLoader, ILoaderOptions } from "@fluidframework/container-definitions";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import * as Comlink from "comlink";

// Proxy loader that proxies request to web worker.
interface IProxyLoader extends IHostLoader, IFluidRunnable {
    // eslint-disable-next-line @typescript-eslint/no-misused-new
    new(id: string,
        options: ILoaderOptions,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number): IProxyLoader;

    stop(reason?: string): Promise<void>;
}

/**
 * Proxies requests to web worker loader.
 */
export class WebWorkerLoader implements IHostLoader, IFluidRunnable, IFluidRouter {
    public static async load(
        id: string,
        options: ILoaderOptions,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number,
    ) {
        const ProxyLoader = Comlink.wrap<IProxyLoader>(new Worker("/public/scripts/dist/worker.min.js"));
        const proxyLoader = await new ProxyLoader(
            id,
            options,
            resolved,
            fromSequenceNumber,
        );
        return new WebWorkerLoader(proxyLoader);
    }

    constructor(private readonly proxy: Comlink.Remote<IProxyLoader>) {
    }

    public get IFluidRouter() { return this; }
    public get IFluidRunnable() { return this; }

    public async request(request: IRequest): Promise<IResponse> {
        const response = await this.proxy.request(request);
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            return response;
        }
        return { status: 200, mimeType: "fluid/object", value: this };
    }

    public async run(...args: any[]): Promise<void> {
        return this.proxy.run(...args);
    }

    public async stop(reason?: string): Promise<void> {
        return this.proxy.stop(reason);
    }

    public async resolve(request: IRequest, pendingLocalState?: string): Promise<IContainer> {
        return this.proxy.resolve(request, pendingLocalState);
    }

    public async createDetachedContainer(source: IFluidCodeDetails): Promise<IContainer> {
        return this.proxy.createDetachedContainer(source);
    }

    public async rehydrateDetachedContainerFromSnapshot(source: string): Promise<IContainer> {
        return this.proxy.rehydrateDetachedContainerFromSnapshot(source);
    }
}
