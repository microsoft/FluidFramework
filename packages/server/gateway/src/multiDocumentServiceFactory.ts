/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";

// TODO: Move this into the runtime
export class MultiDocumentServiceFactory implements IDocumentServiceFactory {
    constructor(private factoryMap: { [protocol: string]: IDocumentServiceFactory }) { }
    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type === "prague") {
            const urlObj = new URL(resolvedUrl.url);
            const factory = this.factoryMap[urlObj.protocol];
            if (factory === undefined) { return Promise.reject(new Error("Unknown prague protocol")); }
            return factory.createDocumentService(resolvedUrl);
        }
        return Promise.reject(new Error("Not a prague url"));
    }
}
