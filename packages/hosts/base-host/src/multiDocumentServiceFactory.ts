/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/protocol-definitions";
import { parse } from "url";

/**
 * MultiDocumentServiceFactory provides a wrapper around a map of protocol to IDocumentServiceFactory in order to
 * support multiple document service types from a single factory.
 * TODO: Move this into the loader or into drivers?
 */
export class MultiDocumentServiceFactory implements IDocumentServiceFactory {
    constructor(private readonly factoryMap: { [protocol: string]: IDocumentServiceFactory }) {

    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type === "prague") {
            const urlObj = parse(resolvedUrl.url);
            if (urlObj.protocol === undefined) { return Promise.reject(new Error("No protocol provided")); }
            const factory = this.factoryMap[urlObj.protocol];
            if (factory === undefined) { return Promise.reject(new Error("Unknown fluid protocol")); }
            return factory.createDocumentService(resolvedUrl);
        }
        return Promise.reject(new Error("Not a fluid url"));
    }
}
