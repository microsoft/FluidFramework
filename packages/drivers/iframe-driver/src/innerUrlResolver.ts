/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Comlink from "comlink";
import { assert } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerPackageInfo, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { IUrlResolverProxy, IUrlResolverProxyKey } from "./outerUrlResolver";
import { MakeThinProxy } from "./proxyUtils";

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export class InnerUrlResolver implements IUrlResolver {
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public static async create(outerPort: MessagePort): Promise<InnerUrlResolver> {
        // The outer host is responsible for setting up the iframe, so the proxy connection
        // is expected to exist when running any inner iframe code.
        const combinedProxy = Comlink.wrap(outerPort);
        const outerProxy = combinedProxy[IUrlResolverProxyKey] as Comlink.Remote<IUrlResolverProxy>;
        assert(outerProxy !== undefined, 0x099 /* "OuterUrlResolverProxy unavailable" */);
        await outerProxy.connected();
        return new InnerUrlResolver(outerProxy);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public constructor(
        private readonly outerProxy: IUrlResolverProxy,
    ) {}

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        const returnValueFn = await this.outerProxy.resolve(request);
        return returnValueFn();
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
        packageInfoSource?: IContainerPackageInfo,
    ): Promise<string> {
        return this.outerProxy.getAbsoluteUrl(
            MakeThinProxy(resolvedUrl),
            relativeUrl,
            MakeThinProxy(packageInfoSource),
        );
    }
}
