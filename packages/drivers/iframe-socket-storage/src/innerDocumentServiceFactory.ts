/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/protocol-definitions";
import { InnerDocumentService } from "./innerDocumentService";

/**
 * Connects to the outerDocumentService factory across the iframe boundary
 */
export class InnerDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid:";
    private innerDocumentServiceP: Promise<IDocumentService> | undefined;
    constructor() {

    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (!this.innerDocumentServiceP) {

            this.innerDocumentServiceP = InnerDocumentService.create();
        }
        return this.innerDocumentServiceP;
    }
}
