/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { IRequest, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IUrlResolver, IResolvedUrl } from "@fluidframework/driver-definitions";
import { debug } from "./debug";
import { MakeThinProxy } from "./proxyUtils";

export interface IUrlResolverProxy {
    connected(): Promise<void>,
    resolve(
        request: IRequest,
    ): Promise<() => Promise<IResolvedUrl | undefined>>,
    getAbsoluteUrl(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        relativeUrl: string,
        codeDetailsFn: () => Promise<IFluidCodeDetails | undefined>,
    ): Promise<string>,
}

export const IUrlResolverProxyKey = "IUrlResolverProxy";

export class OuterUrlResolver {
    public constructor(
        private readonly urlResolver: IUrlResolver,
    ) { }

    public createProxy() {
        const proxy: IUrlResolverProxy = {
            connected: Comlink.proxy(async () => this.connected()),
            resolve: Comlink.proxy(async (requestFn) => this.resolve(requestFn)),
            getAbsoluteUrl: Comlink.proxy(async (resolvedUrlFn, relativeUrl, codeDetailsFn) =>
                this.getAbsoluteUrl(resolvedUrlFn, relativeUrl, codeDetailsFn),
            ),
        };
        return proxy;
    }

    public async connected() {
        debug("IFrame Connection Succeeded");
    }

    public async resolve(
        request: IRequest,
    ): Promise<() => Promise<IResolvedUrl | undefined>> {
        const resolved = await this.urlResolver.resolve(request);
        return MakeThinProxy(resolved);
    }

    public async getAbsoluteUrl(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        relativeUrl: string,
        codeDetailsFn: () => Promise<IFluidCodeDetails | undefined>,
    ): Promise<string> {
        const resolvedUrl = await resolvedUrlFn();
        const codeDetails = await codeDetailsFn();
        return this.urlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl, codeDetails);
    }
}
