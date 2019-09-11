/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLVisual,
    IComponentQueryableLegacy,
    IRequest,
} from "@prague/component-core-interfaces";
import { ICodeLoader } from "@prague/container-definitions";
import { Container, createProtocolToFactoryMapping, Loader, selectDocumentServiceFactoryForProtocol } from "@prague/container-loader";
import {
    InnerDocumentServiceFactory,
    InnerUrlResolver,
    OuterDocumentServiceFactory,
} from "@prague/iframe-socket-storage";
import { IResolvedPackage, WebCodeLoader } from "@prague/loader-web";
import { OdspDocumentServiceFactory } from "@prague/odsp-socket-storage";
import {
    IDocumentServiceFactory,
    IErrorTrackingService,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@prague/protocol-definitions";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { IGitCache } from "@prague/services-client";
import { BaseTelemetryNullLogger } from "@prague/utils";

const getStorageTokenStub = (siteUrl: string) => Promise.resolve("fake token");
const getWebsocketTokenStub = () => Promise.resolve("fake token");

export interface IPrivateSessionInfo {
    outerSession?: boolean;

    innerSession?: boolean;

    frameP?: Promise<HTMLIFrameElement>;

    request?: IRequest;
}

async function attach(loader: Loader, url: string, div: HTMLDivElement) {
    const response = await loader.request({ url });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        return;
    }

    // Check if the component is viewable
    const component = response.value as IComponent;
    const queryable = component as IComponentQueryableLegacy;
    let viewable = component.IComponentHTMLVisual;
    if (!viewable && queryable.query) {
        viewable = queryable.query<IComponentHTMLVisual>("IComponentHTMLVisual");
    }
    if (viewable) {
        const renderable =
            viewable.addView ? viewable.addView() : viewable;

        renderable.render(div, { display: "block" });
        return;
    }
}

export async function initializeChaincode(document: Container, pkg: IResolvedPackage): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        // We propose both code and code2. code2 is the legacy format of just a string. code is the new object
        // based format.
        await Promise.all([
            quorum.propose("code", pkg.details),
            quorum.propose("code2", pkg.parsed.full),
        ]);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

export async function registerAttach(loader: Loader, container: Container, uri: string, div: HTMLDivElement) {
    attach(loader, uri, div);
    container.on("contextChanged", (value) => {
        attach(loader, uri, div);
    });
}

export function createLoader(
    baseUrl: string,
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    jwt: string,
    config: any,
    scope: IComponent,
    codeLoader: ICodeLoader,
    errorService: IErrorTrackingService,
    getStorageToken: (siteUrl: string) => Promise<string | null> = getStorageTokenStub,
    getWebsocketToken: () => Promise<string | null> = getWebsocketTokenStub,
    privateSession: IPrivateSessionInfo = {
        innerSession: false,
        outerSession: false,
    },
): Loader {

    let resolver: IUrlResolver;
    let documentServiceFactories: IDocumentServiceFactory[];
    if (privateSession.innerSession) {
        // TODO: protect this typing more carefully
        resolver = new InnerUrlResolver(resolved);
        documentServiceFactories = [new InnerDocumentServiceFactory()];
    } else {
        resolver = new ContainerUrlResolver(
            baseUrl,
            jwt,
            new Map<string, IResolvedUrl>([[url, resolved]]));

        const r11sDocumentServiceFactory =
            new RouterliciousDocumentServiceFactory(false, errorService, false, true, cache);
        const odspDocumentServiceFactory = new OdspDocumentServiceFactory(
            "Server Gateway",
            getStorageToken,
            getWebsocketToken,
            new BaseTelemetryNullLogger());
        documentServiceFactories = [odspDocumentServiceFactory, r11sDocumentServiceFactory];
    }

    const options = {
        blockUpdateMarkers: true,
        config,
        tokens: (resolved as IFluidResolvedUrl).tokens,
    };

    if (privateSession.outerSession) {
        const factoryMap = createProtocolToFactoryMapping(documentServiceFactories);
        new OuterDocumentServiceFactory(
            selectDocumentServiceFactoryForProtocol(resolved as IFluidResolvedUrl, factoryMap),
            privateSession.frameP,
            options,
            { resolver },
            ).createDocumentServiceFromRequest({ url });
        return;
    }

    return new Loader(
        { resolver },
        documentServiceFactories,
        codeLoader,
        options,
        scope);
}

export function createWebLoader(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
    scope: IComponent,
    privateSession?: IPrivateSessionInfo,
    getStorageToken: (siteUrl: string) => Promise<string | null> = getStorageTokenStub,
    getWebsocketToken: () => Promise<string | null> = getWebsocketTokenStub,
): Loader {
    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebCodeLoader(npm);
    if (pkg) {
        if (pkg.pkg) { // this is an IFluidPackage
            codeLoader.seed(pkg.pkg, pkg.details.config, scriptIds);
            if (pkg.details.package === pkg.pkg.name) {
                pkg.details.package = `${pkg.pkg.name}@${pkg.pkg.version}`;
            }
        }

        // The load takes in an IFluidCodeDetails
        codeLoader.load(pkg.details).catch((error) => console.error("script load error", error));
    }

    const errorService = new DefaultErrorTracking();

    const loader = createLoader(
        document.location.origin,
        url,
        resolved,
        cache,
        jwt,
        config,
        scope,
        codeLoader,
        errorService,
        getStorageToken,
        getWebsocketToken,
        privateSession);
    return loader;
}

export async function start(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
    scope: IComponent,
    div: HTMLDivElement,
): Promise<Container> {
    const loader = createWebLoader(
        url, resolved, cache, pkg, scriptIds, npm, jwt, config, scope);

    const container = await loader.resolve({ url });
    registerAttach(
        loader,
        container,
        url,
        div);

        // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
        // package.
    if (!container.existing) {
            await initializeChaincode(container, pkg)
                .catch((error) => console.error("chaincode error", error));
    }

    return container;
}
