/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseHost,
    IHostConfig,
} from "@microsoft/fluid-base-host";
import { IComponent, IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IProxyLoaderFactory,
    IResolvedUrl } from "@microsoft/fluid-container-definitions";
import {
    createProtocolToFactoryMapping,
    selectDocumentServiceFactoryForProtocol,
} from "@microsoft/fluid-container-loader";
import { BaseTelemetryNullLogger } from "@microsoft/fluid-core-utils";
import { WebWorkerLoaderFactory } from "@microsoft/fluid-execution-context-loader";
import {
    IFrameDocumentServiceProxyFactory,
    InnerDocumentServiceFactory,
    InnerUrlResolver,
} from "@microsoft/fluid-iframe-driver";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { IGitCache } from "@microsoft/fluid-server-services-client";
import { IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import Axios from "axios";
import { DocumentFactory } from "./documentFactory";

/**
 * Interface to provide the info about the session.
 */
interface IPrivateSessionInfo {
    /**
     * True if the request is made by outer frame.
     */
    outerSession?: boolean;

    /**
     * True if the request is made by inner frame.
     */
    innerSession?: boolean;

    /**
     * IFrame in which the inner session is loaded.
     */
    frame?: HTMLIFrameElement;

    /**
     * Request to be resolved.
     */
    request?: IRequest;
}

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    jwt: string,
    config: any,
    clientId: string,
    scope: IComponent,
    innerSession: boolean = false,
    outerSession: boolean = true,
) {
    console.log(`Loading ${url}`);

    const privateSession: IPrivateSessionInfo = {
        innerSession,
        outerSession,
        request: { url },
    };

    let documentFactory: DocumentFactory;

    const div = document.getElementById("content") as HTMLDivElement;
    // Don't resolve in the outer session
    if (!privateSession.outerSession) {
        const hostConf: IHostConfig = {
            documentServiceFactory: new InnerDocumentServiceFactory(),
            urlResolver: new InnerUrlResolver(resolved),
        };

        const baseHost = new BaseHost(resolved, pkg, scriptIds, config, scope, hostConf,
            new Map<string, IProxyLoaderFactory>([["webworker", new WebWorkerLoaderFactory()]]));
        const loader = await baseHost.getLoader();

        documentFactory = new DocumentFactory(config.tenantId,
            config.moniker,
            config.url);

        documentFactory.resolveLoader(loader);

        await baseHost.loadAndRender(url, div, pkg);
    } else {
        const documentServiceFactories: IDocumentServiceFactory[] = [];
        // TODO: need to be support refresh token
        documentServiceFactories.push(new OdspDocumentServiceFactory(
            clientId,
            (siteUrl: string) => Promise.resolve(resolved.tokens.storageToken) ,
            () => Promise.resolve(resolved.tokens.socketToken),
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
        privateSession.frame = document.getElementById("ifr") as HTMLIFrameElement;

        const resolver = new ContainerUrlResolver(
            document.location.origin,
            jwt,
            new Map<string, IResolvedUrl>([[url, resolved]]));

        const options = {
            blockUpdateMarkers: true,
            config,
            tokens: (resolved as IFluidResolvedUrl).tokens,
        };

        (await IFrameDocumentServiceProxyFactory.create(
            selectDocumentServiceFactoryForProtocol(resolved as IFluidResolvedUrl, factoryMap),
            privateSession.frame,
            options,
            { resolver },
            )).createDocumentServiceFromRequest({ url });
    }
}
