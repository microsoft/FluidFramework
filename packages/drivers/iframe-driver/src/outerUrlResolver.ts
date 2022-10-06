/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Comlink from "comlink";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerPackageInfo, IUrlResolver, IResolvedUrl } from "@fluidframework/driver-definitions";
import { MakeThinProxy } from "./proxyUtils";

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export interface IUrlResolverProxy {
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    connected(): Promise<void>;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    resolve(
        request: IRequest,
    ): Promise<() => Promise<IResolvedUrl | undefined>>;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    getAbsoluteUrl(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        relativeUrl: string,
        packageInfoFn: () => Promise<IContainerPackageInfo | undefined>,
    ): Promise<string>;
}

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export const IUrlResolverProxyKey = "IUrlResolverProxy";

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export class OuterUrlResolver {
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public constructor(
        private readonly urlResolver: IUrlResolver,
    ) { }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
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

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async connected() {
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async resolve(
        request: IRequest,
    ): Promise<() => Promise<IResolvedUrl | undefined>> {
        const resolved = await this.urlResolver.resolve(request);
        return MakeThinProxy(resolved);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async getAbsoluteUrl(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        relativeUrl: string,
        packageInfoFn: () => Promise<IContainerPackageInfo | undefined>,
    ): Promise<string> {
        const resolvedUrl = await resolvedUrlFn();
        const packageInfo = await packageInfoFn();
        return this.urlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl, packageInfo);
    }
}
