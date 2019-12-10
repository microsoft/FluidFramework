/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import * as Comlink from "comlink";
import { InnerDocumentService } from "./innerDocumentService";
import { IDocumentServiceFactoryProxy } from "./outerDocumentServiceFactory";

/**
 * Connects to the outerDocumentService factory across the iframe boundary
 */
export class InnerDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid:";

    private readonly outerProxyP: Promise<IDocumentServiceFactoryProxy>;

    constructor() {
        this.outerProxyP = this.createOuterProxy();
    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {

        const outerProxy = await this.outerProxyP;

        const outerDocumentServiceProxy = await outerProxy.createDocumentService(resolvedUrl as IFluidResolvedUrl);

        return InnerDocumentService.create(outerProxy.clients[outerDocumentServiceProxy]);
    }

    private async createOuterProxy(): Promise<IDocumentServiceFactoryProxy> {
        return new Promise<IDocumentServiceFactoryProxy>(async (resolve, reject) => {
            const create = async () => {

                // If the parent endpoint does not exist, returns empty proxy silently (no connection/failure case)
                const proxyP =
                    Comlink.wrap<Promise<IDocumentServiceFactoryProxy>>(Comlink.windowEndpoint(window.parent));

                return proxyP.then(async (proxy) => {
                    // Check if the proxy is empty
                    await proxy.connected();
                    resolve(proxy);
                });
            };

            // If innerFactory is created second, the outerFactory will trigger the connection
            const evtListener = async () => {
                await create();
            };

            window.addEventListener("message", evtListener, { once: true });

            // Attempt to connect, does not connect if innerDocumentServiceFactory
            // is created before outerDocumentServiceFactory
            await create();

            // Remove eventListener if the create returns, the trigger was sent before inner was created
            // Leaving the eventListener will eat events.
            window.removeEventListener("message", evtListener);
        });

    }
}
