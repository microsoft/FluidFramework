/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { IRequest, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IContainerPackageInfo, IUrlResolver, IResolvedUrl } from "@fluidframework/driver-definitions";
import { MakeThinProxy } from "./proxyUtils";

export interface IUrlResolverProxy {
    connected(): Promise<void>,
    resolve(
        request: IRequest,
    ): Promise<() => Promise<IResolvedUrl | undefined>>,
    getAbsoluteUrl(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        relativeUrl: string,
        packageInfoFn: () => Promise<IContainerPackageInfo | IFluidCodeDetails | undefined>,
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
            getAbsoluteUrl: Comlink.proxy(async (resolvedUrlFn, relativeUrl, packageInfoFn) =>
                this.getAbsoluteUrl(resolvedUrlFn, relativeUrl, packageInfoFn),
            ),
        };
        return proxy;
    }

    public async connected() {
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
        packageInfoFn: () => Promise<IContainerPackageInfo | IFluidCodeDetails | undefined>,
    ): Promise<string> {
        const resolvedUrl = await resolvedUrlFn();
        const packageInfo = await packageInfoFn();
        return this.urlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl, packageInfo);
    }
}
