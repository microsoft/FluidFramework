/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
    IDocumentServiceFactory,
    IResolvedUrl,
    IDocumentService,
} from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ensureFluidResolvedUrl } from "./fluidResolvedUrl";

export class MultiDocumentServiceFactory implements IDocumentServiceFactory {
    public static create(documentServiceFactory: IDocumentServiceFactory | IDocumentServiceFactory[]) {
        if (Array.isArray(documentServiceFactory)) {
            const factories: IDocumentServiceFactory[] = [];
            documentServiceFactory.forEach((factory) => {
                const maybeMulti = factory as MultiDocumentServiceFactory;
                if (maybeMulti.protocolToDocumentFactoryMap !== undefined) {
                    factories.push(...maybeMulti.protocolToDocumentFactoryMap.values());
                } else {
                    factories.push(factory);
                }
            });
            if (factories.length === 1) {
                return factories[0];
            }
            return new MultiDocumentServiceFactory(factories);
        }
        return documentServiceFactory;
    }

    private readonly protocolToDocumentFactoryMap: Map<string, IDocumentServiceFactory>;

    constructor(documentServiceFactories: IDocumentServiceFactory[]) {
        this.protocolToDocumentFactoryMap = new Map();
        documentServiceFactories.forEach((factory: IDocumentServiceFactory) => {
            this.protocolToDocumentFactoryMap.set(factory.protocolName, factory);
        });
    }
    public readonly protocolName = "none:";
    async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);
        const urlObj = parse(resolvedUrl.url);
        if (urlObj.protocol === undefined || urlObj.protocol === null) {
            throw new Error("No protocol provided");
        }
        const factory: IDocumentServiceFactory | undefined = this.protocolToDocumentFactoryMap.get(urlObj.protocol);
        if (factory === undefined) {
            throw new Error("Unknown Fluid protocol");
        }

        return factory.createDocumentService(resolvedUrl, logger, clientIsSummarizer);
    }

    public async createContainer(
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(createNewResolvedUrl);
        const urlObj = parse(createNewResolvedUrl.url);
        if (urlObj.protocol === undefined || urlObj.protocol === null) {
            throw new Error("No protocol provided");
        }
        const factory: IDocumentServiceFactory | undefined = this.protocolToDocumentFactoryMap.get(urlObj.protocol);
        if (factory === undefined) {
            throw new Error("Unknown Fluid protocol");
        }
        return factory.createContainer(createNewSummary, createNewResolvedUrl, logger, clientIsSummarizer);
    }
}
