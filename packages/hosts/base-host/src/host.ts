/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLVisual,
    IComponentQueryableLegacy,
} from "@prague/component-core-interfaces";
import { ICodeLoader } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { IResolvedPackage, WebLoader } from "@prague/loader-web";
import { OdspDocumentServiceFactory } from "@prague/odsp-socket-storage";
import { IErrorTrackingService, IResolvedUrl } from "@prague/protocol-definitions";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { IGitCache } from "@prague/services-client";
import { EventEmitter } from "events";
import { MultiDocumentServiceFactory } from "./multiDocumentServiceFactory";

async function attach(loader: Loader, url: string, host: Host) {
    const response = await loader.request({ url });

    if (response.status !== 200 || response.mimeType !== "prague/component") {
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

        renderable.render(host.div);
        return;
    }

    // TODO included for back compat - continued to be included to support very old components
    // tslint:disable-next-line: no-unsafe-any
    if ("attach" in response.value) {
        const legacy = response.value as { attach(platform: LocalPlatform): void };
        legacy.attach(new LocalPlatform(host.div));
        return;
    }
}

class LocalPlatform extends EventEmitter {
    constructor(private readonly div: HTMLElement) {
        super();
    }

    /**
     * Queries the platform for an interface of the given ID.
     * @param id - id of the interface for which the query is made.
     */
    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "dom":
                return document;
            case "div":
                return this.div;
            default:
                return null;
        }
    }

    // Temporary measure to indicate the UI changed
    public update() {
        this.emit("update");
    }

    public detach() {
        return;
    }
}

class Host {
    constructor(public readonly div: HTMLElement) {
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

async function registerAttach(loader: Loader, container: Container, uri: string, host: Host) {
    attach(loader, uri, host);
    container.on("contextChanged", (value) => {
        attach(loader, uri, host);
    });
}

export function getLoader(
    baseUrl: string,
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    jwt: string,
    config: any,
    codeLoader: ICodeLoader,
    errorService: IErrorTrackingService,
): Loader {
    // URL resolver for routes
    const resolver = new ContainerUrlResolver(
        baseUrl,
        jwt,
        new Map<string, IResolvedUrl>([[url, resolved]]));

    const r11sDocumentServiceFactory = new RouterliciousDocumentServiceFactory(false, errorService, false, true, cache);
    const odspDocumentServiceFactory = new OdspDocumentServiceFactory("Server Gateway");
    const documentServiceFactory = new MultiDocumentServiceFactory(
        {
            "prague-odsp:": odspDocumentServiceFactory,
            "prague:": r11sDocumentServiceFactory,
        });

    return new Loader(
        { resolver },
        documentServiceFactory,
        codeLoader,
        {
            blockUpdateMarkers: true,
            config,
         });
}

export let lastLoaded: Container;

export async function start(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
    div?: HTMLDivElement,
): Promise<void> {
    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebLoader(npm);
    if (pkg) {
        if (pkg.pkg) {
            codeLoader.seed(pkg.pkg, pkg.details.config, scriptIds);
            if (pkg.details.package === pkg.pkg.name) {
                pkg.details.package = `${pkg.pkg.name}@${pkg.pkg.version}`;
            }
        }
        codeLoader.load(pkg.details).catch((error) => console.error("script load error", error));
    }

    const errorService = new DefaultErrorTracking();
    const loader = getLoader(
        document.location.origin,
        url,
        resolved,
        cache,
        jwt,
        config,
        codeLoader,
        errorService);
    const container = await loader.resolve({ url });
    lastLoaded = container;

    const platform = new Host(div ? div : document.getElementById("content"));
    registerAttach(
        loader,
        container,
        url,
        platform);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, pkg)
            .catch((error) => console.error("chaincode error", error));
    }
}
