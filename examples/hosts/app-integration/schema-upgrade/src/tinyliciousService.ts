/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureTinyliciousTokenProvider, InsecureTinyliciousUrlResolver } from "@fluidframework/tinylicious-driver";

export class TinyliciousService {
    public readonly documentServiceFactory: IDocumentServiceFactory;
    public readonly urlResolver: IUrlResolver;

    constructor(tinyliciousPort?: number) {
        const tokenProvider = new InsecureTinyliciousTokenProvider();
        this.urlResolver = new InsecureTinyliciousUrlResolver(tinyliciousPort);
        this.documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    }
}
