/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentService,
    IDocumentServiceFactory,
    IUrlResolver,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import Comlink from "comlink";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { InnerDocumentService } from "./innerDocumentService";
import { IDocumentServiceFactoryProxy } from "./outerDocumentServiceFactory";
import { InnerUrlResolver } from "./innerUrlResolver";

/**
 * Connects to the outerDocumentService factory across the iframe boundary
 */
export class InnerDocumentServiceFactory implements IDocumentServiceFactory {
    public static async create(): Promise<InnerDocumentServiceFactory> {
        let outerProxy: Comlink.Remote<IDocumentServiceFactoryProxy>;
        const create = async () => {
            // If the parent endpoint does not exist, returns empty proxy silently (no connection/failure case)
            if (outerProxy === undefined) {
                outerProxy = Comlink.wrap<IDocumentServiceFactoryProxy>(Comlink.windowEndpoint(window.parent));
            }
            if (outerProxy) {
                await outerProxy.connected();
                return outerProxy;
            }
        };
        // If innerFactory is created second, the outerFactory will trigger the connection
        const evtListener = (resolve) => {
            create()
                .then((value) => {
                    if (value) {
                        resolve(value);
                    }
                })
                .catch(() => { });
        };

        const eventP = new Promise<Comlink.Remote<IDocumentServiceFactoryProxy>>(
            (resolve) => window.addEventListener("message", () => evtListener(resolve), { once: true }));

        // Attempt to connect, does not connect if innerDocumentServiceFactory
        // is created before outerDocumentServiceFactory
        const rtnProxy = await create() ?? await eventP;

        // Remove eventListener if the create returns, the trigger was sent before inner was created
        // Leaving the eventListener will eat events.
        window.removeEventListener("message", evtListener);
        const url = await rtnProxy.getFluidUrl();
        return new InnerDocumentServiceFactory(rtnProxy, url);
    }

    public static readonly protocolName = "fluid:";
    public readonly protocolName = InnerDocumentServiceFactory.protocolName;
    public readonly urlResolver: IUrlResolver;
    private constructor(
        private readonly outerProxy: Comlink.Remote<IDocumentServiceFactoryProxy>,
        public readonly resolvedUrl: IFluidResolvedUrl) {
        this.urlResolver = new InnerUrlResolver(resolvedUrl);
    }

    public async createDocumentService(): Promise<IDocumentService> {
        const outerDocumentServiceProxy = await this.outerProxy.createDocumentService();

        return InnerDocumentService.create(this.outerProxy.clients[outerDocumentServiceProxy]);
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }
}
