/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-core-utils";
import { IDocumentService,
        IDocumentServiceFactory,
        IFluidResolvedUrl,
        IResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import * as Comlink from "comlink";
import { InnerDocumentService } from "./innerDocumentService";
import { IDocumentServiceProxy } from "./outerDocumentServiceFactory";

// tslint:disable: no-unsafe-any

/**
 * Connects to the outerDocumentService factory across the iframe boundary
 */
export class InnerDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid:";

    private readonly outerProxyP: Promise<IDocumentServiceProxy>;
    private workingP: Deferred<void> | undefined;

    constructor() {
        // tslint:disable-next-line: no-floating-promises
        this.outerProxyP = this.createOuterProxy();
    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (this.workingP !== undefined) {
            await this.workingP.promise;
        }
        // TODO: Check this deferred thing...
        this.workingP = new Deferred();
        const outerProxy = await this.outerProxyP;

        const outerDocumentServiceProxy = await outerProxy.createDocumentService(resolvedUrl as IFluidResolvedUrl);
        console.log(await (outerProxy as any).tokens.jwt);
        console.log((outerProxy as any).tokens.jwt);

        this.workingP.resolve();
        return InnerDocumentService.create(outerProxy.clients[outerDocumentServiceProxy]);
    }

    private async createOuterProxy() {
        return new Promise<any>(async (resolve, reject) => {
            const create = async () => {
                // If the parent endpoint does not exist, returns empty proxy silently (no connection/failure case)
                const proxyP = Comlink.wrap(Comlink.windowEndpoint(window.parent)) as Promise<any>;
                const proxy = await proxyP;
                // Check if the proxy is empty
                // Is there a better way of timing this connected request out?
                await proxy.connected();
                resolve(proxy);
            };

            // If innerFactory is created second, the outerFactory will trigger the connection
            const evtListener = async () => {
                await create();
            };

            window.addEventListener("message", evtListener, {once: true});

            // Attempt to connect, fails silently if innerDocumentServiceFactory
            // is created before outerDocumentServiceFactory
            await create();

            // Remove eventListener if the create returns, the trigger was sent before inner was created
            // Leaving the eventListener will eat events.
            window.removeEventListener("message", evtListener);
        });

    }
}
