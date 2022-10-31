/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { InnerDocumentService } from "./innerDocumentService";
import { IDocumentServiceFactoryProxy, IDocumentServiceFactoryProxyKey } from "./outerDocumentServiceFactory";
import { MakeThinProxy } from "./proxyUtils";

/**
 * Connects to the outerDocumentService factory across the iframe boundary
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export class InnerDocumentServiceFactory implements IDocumentServiceFactory {
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public static async create(outerPort: MessagePort): Promise<InnerDocumentServiceFactory> {
        // The outer host is responsible for setting up the iframe, so the proxy connection
        // is expected to exist when running any inner iframe code.
        const combinedProxy = Comlink.wrap(outerPort);
        const outerProxy =
            combinedProxy[IDocumentServiceFactoryProxyKey] as Comlink.Remote<IDocumentServiceFactoryProxy>;
        assert(outerProxy !== undefined, 0x098 /* "OuterDocumentServiceFactoryProxy unavailable" */);
        await outerProxy.connected();
        return new InnerDocumentServiceFactory(outerProxy);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public static readonly protocolName = "fluid:";
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public readonly protocolName = InnerDocumentServiceFactory.protocolName;
    private constructor(
        private readonly outerProxy: Comlink.Remote<IDocumentServiceFactoryProxy>,
    ) {
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        const outerDocumentServiceProxyId = await this.outerProxy.createDocumentService(MakeThinProxy(resolvedUrl));

        const clients = await this.outerProxy.clients;
        return InnerDocumentService.create(clients[outerDocumentServiceProxyId], resolvedUrl, logger);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        const outerDocumentServiceProxyId = await this.outerProxy.createContainer(
            MakeThinProxy(createNewSummary),
            MakeThinProxy(resolvedUrl),
        );
        const clients = await this.outerProxy.clients;
        return InnerDocumentService.create(clients[outerDocumentServiceProxyId], resolvedUrl, logger);
    }
}
