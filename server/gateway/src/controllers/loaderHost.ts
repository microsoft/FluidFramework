/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    createProtocolToFactoryMapping,
    selectDocumentServiceFactoryForProtocol,
} from "@microsoft/fluid-container-loader";
import { BaseTelemetryNullLogger } from "@microsoft/fluid-core-utils";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import {
    IFrameDocumentServiceProxyFactory,
} from "@microsoft/fluid-iframe-driver";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { IGitCache } from "@microsoft/fluid-server-services-client";
import Axios from "axios";

import * as commits from "./commits";
import * as navbar from "./navbar";

export { commits };
export { navbar };

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    cache: IGitCache,
    jwt: string,
    config: any,
    clientId: string,
) {
    console.log(`Loading ${url}`);

    const documentServiceFactories: IDocumentServiceFactory[] = [];
    // TODO: need to be support refresh token
    documentServiceFactories.push(new OdspDocumentServiceFactory(
        clientId,
        async (siteUrl: string) => Promise.resolve(resolved.tokens.storageToken),
        async () => Promise.resolve(resolved.tokens.socketToken),
        new BaseTelemetryNullLogger()));

    documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        cache));
    const factoryMap = createProtocolToFactoryMapping(documentServiceFactories);

    config.moniker = (await Axios.get("/api/v1/moniker")).data;
    config.url = url;

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IResolvedUrl>([[url, resolved]]));

    const options = {
        blockUpdateMarkers: true,
        config,
        tokens: resolved.tokens,
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (await IFrameDocumentServiceProxyFactory.create(
        selectDocumentServiceFactoryForProtocol(resolved, factoryMap),
        document.getElementById("ifr") as HTMLIFrameElement,
        options,
        resolver,
    )).createDocumentServiceFromRequest({ url });
}
