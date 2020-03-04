/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { IDocumentServiceFactory, IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";

/**
 * Api that creates the protocol to factory map.
 * @param documentServiceFactories - A single factory or array of document factories.
 */
function createProtocolToFactoryMapping(
    documentServiceFactories: IDocumentServiceFactory | IDocumentServiceFactory[],
): Map<string, IDocumentServiceFactory> {
    const protocolToDocumentFactoryMap: Map<string, IDocumentServiceFactory> = new Map();
    if (Array.isArray(documentServiceFactories)) {
        documentServiceFactories.forEach((factory: IDocumentServiceFactory) => {
            protocolToDocumentFactoryMap.set(factory.protocolName, factory);
        });
    } else {
        protocolToDocumentFactoryMap.set(documentServiceFactories.protocolName, documentServiceFactories);
    }
    return protocolToDocumentFactoryMap;
}

/**
 * Api that selects a document service factory from the factory map provided according to protocol
 * in resolved URL.
 * @param resolvedAsFluid - Resolved fluid URL containing driver protocol
 * @param protocolToDocumentFactoryMap - Map of protocol name to factories from which one factory
 * is selected according to protocol.
 */
function selectDocumentServiceFactoryForProtocol(
    resolvedAsFluid: IFluidResolvedUrl,
    protocolToDocumentFactoryMap: Map<string, IDocumentServiceFactory>,
): IDocumentServiceFactory {
    const urlObj = parse(resolvedAsFluid.url);
    if (!urlObj.protocol) {
        throw new Error("No protocol provided");
    }
    const factory: IDocumentServiceFactory | undefined = protocolToDocumentFactoryMap.get(urlObj.protocol);
    if (!factory) {
        throw new Error("Unknown fluid protocol");
    }
    return factory;
}


export class DocumentServiceFactoryProtocolMatcher{
    private readonly protocolToDocumentFactoryMap: Map<string, IDocumentServiceFactory>;

    constructor(documentServiceFactories: IDocumentServiceFactory | IDocumentServiceFactory[]) {
        this.protocolToDocumentFactoryMap = createProtocolToFactoryMapping(documentServiceFactories);
    }

    public getFactory(resolvedAsFluid: IFluidResolvedUrl) {
        return selectDocumentServiceFactoryForProtocol(
            resolvedAsFluid,
            this.protocolToDocumentFactoryMap);
    }
}
