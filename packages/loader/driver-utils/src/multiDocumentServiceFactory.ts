/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
    IDocumentServiceFactory,
    IResolvedUrl,
    IDocumentService,
} from "@microsoft/fluid-driver-definitions";
import { ISummaryTree } from "@microsoft/fluid-protocol-definitions";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { ensureFluidResolvedUrl } from "./fluidResolvedUrl";

export class MultiDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly isExperimentalDocumentServiceFactory = true;
    public static create(documentServiceFactory: IDocumentServiceFactory | IDocumentServiceFactory[]) {
        if (Array.isArray(documentServiceFactory)) {
            const factories: IDocumentServiceFactory[] = [];
            documentServiceFactory.forEach((factory)=>{
                const maybeMulti = factory as MultiDocumentServiceFactory;
                if (maybeMulti.protocolToDocumentFactoryMap !== undefined) {
                    factories.push(... maybeMulti.protocolToDocumentFactoryMap.values());
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
    async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);
        const urlObj = parse(resolvedUrl.url);
        if (urlObj.protocol === undefined) {
            throw new Error("No protocol provided");
        }
        const factory: IDocumentServiceFactory | undefined = this.protocolToDocumentFactoryMap.get(urlObj.protocol);
        if (factory === undefined) {
            throw new Error("Unknown fluid protocol");
        }

        return factory.createDocumentService(resolvedUrl);
    }

    public async createContainer(
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger: ITelemetryLogger,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(createNewResolvedUrl);
        const urlObj = parse(createNewResolvedUrl.url);
        if (urlObj.protocol === undefined) {
            throw new Error("No protocol provided");
        }
        const factory: IDocumentServiceFactory | undefined = this.protocolToDocumentFactoryMap.get(urlObj.protocol);
        if (factory === undefined) {
            throw new Error("Unknown fluid protocol");
        }
        return factory.createContainer(createNewSummary, createNewResolvedUrl, logger);
    }
}
