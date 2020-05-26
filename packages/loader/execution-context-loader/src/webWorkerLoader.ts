/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { IContainer, ILoader, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import Comlink from "comlink";

// Proxy loader that proxies request to web worker.
interface IProxyLoader extends ILoader, IComponentRunnable {
    // eslint-disable-next-line @typescript-eslint/no-misused-new
    new(id: string,
        options: any,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number): IProxyLoader;

    stop(reason?: string): Promise<void>;
}

/**
 * Proxies requests to web worker loader.
 */
export class WebWorkerLoader implements ILoader, IComponentRunnable, IComponentRouter {
    public static async load(
        id: string,
        options: any,
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

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    public async request(request: IRequest): Promise<IResponse> {
        const response = await this.proxy.request(request);
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return response;
        }
        return { status: 200, mimeType: "fluid/component", value: this };
    }

    public async run(...args: any[]): Promise<void> {
        return this.proxy.run(...args);
    }

    public async stop(reason?: string): Promise<void> {
        return this.proxy.stop(reason);
    }

    public async resolve(request: IRequest): Promise<IContainer> {
        return this.proxy.resolve(request);
    }

    public async createDetachedContainer(source: IFluidCodeDetails): Promise<IContainer> {
        return this.proxy.createDetachedContainer(source);
    }
}
