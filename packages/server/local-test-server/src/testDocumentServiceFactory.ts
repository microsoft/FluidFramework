/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@prague/container-definitions";
import { TokenProvider } from "@prague/routerlicious-socket-storage";
import { parse } from "url";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";
import { createTestDocumentService } from "./testDocumentService";

export class TestDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private testDeltaConnectionServer: ITestDeltaConnectionServer) {}

    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type !== "prague") {
            // tslint:disable-next-line:max-line-length
            return Promise.reject("Only Fluid components currently supported in the RouterliciousDocumentServiceFactory");
        }

        const parsedUrl = parse(resolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.path.split("/");
        if (!documentId || !tenantId) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const fluidResolvedUrl = resolvedUrl as IFluidResolvedUrl;
        const jwtToken = fluidResolvedUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);

        return Promise.resolve(
            createTestDocumentService(this.testDeltaConnectionServer, tokenProvider, tenantId, documentId));
    }
}
