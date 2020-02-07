/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ICodeLoader,
    IFluidCodeDetails,
    IProxyLoaderFactory,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { IDocumentServiceFactory, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { debug } from "./debug";

/**
 * Helper class for Testhost to load container and components.
 */
export class TestDataStore {
    constructor(
        private readonly codeLoader: ICodeLoader,
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly resolver: IUrlResolver,
    ) { }

    /**
     * Open or create a component instance.
     *
     * @param componentId - Identity of the component.
     * @param chaincodePackage - Identity of the chaincode package to use, if creating the component.
     * @param path - Route to the desired subcomponent (use "" to retrieve the root component).
     * @param services - Services to provided by the caller to the component.
     */
    public async open<T>(
        componentId: string,
        chaincodePackage: IFluidCodeDetails,
        path: string,
        scope?: IComponent,
    ): Promise<T> {
        debug(`TestDataStore.open("${componentId}", "${chaincodePackage.package}")`);

        const resolver = this.resolver;
        const loader = new Loader(
            resolver,
            this.documentServiceFactory,
            this.codeLoader,
            { blockUpdateMarkers: true },
            scope || {},
            new Map<string, IProxyLoaderFactory>());
        const baseUrl = `https://test.com/tenantId/documentId/${encodeURIComponent(componentId)}`;
        const url = `${baseUrl}${
            // Ensure '/' separator when concatenating 'baseUrl' and 'path'.
            (path && path.charAt(0)) !== "/" ? "/" : ""
            // eslint-disable-next-line @typescript-eslint/indent
            }${path}`;

        debug(`resolving baseUrl = ${baseUrl}`);
        const container = await loader.resolve({ url: baseUrl });
        debug(`resolved baseUrl = ${baseUrl}`);

        let acceptResultOut: (value: T) => void;
        const resultOut = new Promise<T>((accept) => { acceptResultOut = accept; });

        debug(`attaching url = ${url}`);
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        container.on("contextChanged", async () => {
            debug(`contextChanged url=${url}`);
            await attach(loader, url, acceptResultOut);
        });
        await attach(loader, url, acceptResultOut);
        debug(`attached url = ${url}`);

        // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
        // package.
        if (!container.existing) {
            debug("initializing chaincode");

            await initializeChaincode(container, chaincodePackage)
                .catch((error) => { console.assert(false, `chaincode error: ${error}`); });
            debug("chaincode initialized");
        }

        // Return the constructed/loaded component.  We retrieve this via queryInterface on the
        // IPlatform created by ChainCode.run().
        return resultOut;
    }
}

async function initializeChaincode(container: Container, pkg: IFluidCodeDetails): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = container.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => { resolve(); }));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }

    debug(`Code is ${quorum.get("code")}`);
}

async function attach<T>(
    loader: Loader,
    url: string,
    resultOut: (out: T) => void,
) {
    debug(`loader.request(url=${url})`);
    const response = await loader.request({ url });

    if (response.status !== 200) {
        debug(`Error: loader.request(url=${url}) -> ${response.status}`);
        return;
    }

    const mimeType = response.mimeType;
    debug(`loader.request(url=${url}) -> ${mimeType}`);
    switch (mimeType) {
        case "fluid/component":
        case "fluid/dataType":
            resultOut(response.value as T);
            break;
        default:
            debug(`Unhandled mimeType ${mimeType}`);
    }
}
