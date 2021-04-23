/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { MultiDocumentServiceFactory } from "@fluidframework/driver-utils";
import {
    IFrameDocumentServiceProxyFactory,
} from "@fluidframework/iframe-driver";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import { IGitCache } from "@fluidframework/server-services-client";
import Axios from "axios";

import { GatewayTokenProvider } from "../shared";
import * as commits from "./commits";
import * as navbar from "./navbar";
import { debug } from "./debug";

export { commits };
export { navbar };

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    cache: IGitCache,
    hostToken: string,
    accessToken: string,
    config: any,
    clientId: string,
    isSpoTenantPath: boolean,
) {
    debug(`Loading ${url}`);

    const documentServiceFactories: IDocumentServiceFactory[] = [];
    if (isSpoTenantPath) {
        // TODO: need to be support refresh token
        documentServiceFactories.push(new OdspDocumentServiceFactory(
            async () => Promise.resolve(resolved.tokens.storageToken),
            async () => Promise.resolve(resolved.tokens.socketToken)));
    } else {
        const tokenProvider = new GatewayTokenProvider(document.location.origin, resolved.url, hostToken, accessToken);
        documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
            tokenProvider,
            false,
            new DefaultErrorTracking(),
            false,
            true,
            cache));
    }

    config.moniker = (await Axios.get("/api/v1/moniker")).data;
    config.url = url;

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        hostToken,
        new Map<string, IResolvedUrl>([[url, resolved]]));

    const options = {
        blockUpdateMarkers: true,
        config,
        tokens: resolved.tokens,
    };
    const factory = new MultiDocumentServiceFactory(documentServiceFactories);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (await IFrameDocumentServiceProxyFactory.create(
        factory,
        document.getElementById("ifr") as HTMLIFrameElement,
        options,
        resolver,
    )).createDocumentServiceFromRequest({ url });
}
