/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ILoader } from "@microsoft/fluid-container-definitions";
import { IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import * as Comlink from "comlink";

// Proxy loader that proxies request to web worker.
interface IProxyLoader extends ILoader, IComponentRunnable {
    // tslint:disable no-misused-new
    new(id: string,
        version: string | null | undefined,
        connection: string,
        options: any,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number,
        canReconnect: boolean): IProxyLoader;

    stop(reason?: string): Promise<void>;
}

// Proxies request to web worker loader.
export class WorkerLoader {
    public static async load(
        id: string,
        version: string | null | undefined,
        connection: string,
        options: any,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number,
        canReconnect: boolean,
    ) {
        const ProxyLoader = Comlink.wrap<IProxyLoader>(new Worker("/public/scripts/dist/worker.min.js"));
        const proxyLoader = await new ProxyLoader(
            id,
            version,
            connection,
            options,
            resolved,
            fromSequenceNumber,
            canReconnect,
        );
        return new WorkerLoader(proxyLoader);
    }

    constructor(private readonly proxy: Comlink.Remote<IProxyLoader>) {
    }

    public async request(request: IRequest): Promise<IResponse> {
        const response = await this.proxy.request(request);
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return response;
        }
        return { status: 200, mimeType: "fluid/component", value: new Runnable(this.proxy) };
    }
}

// Proxies request to IComponentRunnable.
class Runnable implements IComponentRouter, IComponentRunnable {
    constructor(private readonly proxy: Comlink.Remote<IProxyLoader>) {}

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    public async run(...args: any[]): Promise<void> {
        return this.proxy.run(...args);
    }

    public async stop(reason?: string): Promise<void> {
        return this.proxy.stop(reason);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}
