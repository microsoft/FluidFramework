/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentService,
    IDocumentServiceFactory,
    IPragueResolvedUrl,
    IResolvedUrl,
} from "@prague/container-definitions";
import { TokenProvider } from "@prague/routerlicious-socket-storage";
import { parse } from "url";
import { createTestDocumentService } from "./registration";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";

export class TestDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private testDeltaConnectionServer: ITestDeltaConnectionServer) {}

    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type !== "prague") {
            // tslint:disable-next-line:max-line-length
            return Promise.reject("Only Prague components currently supported in the RouterliciousDocumentServiceFactory");
        }

        const parsedUrl = parse(resolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.path.split("/");
        if (!documentId || !tenantId) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const pragueResolvedUrl = resolvedUrl as IPragueResolvedUrl;
        const jwtToken = pragueResolvedUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);

        return Promise.resolve(
            createTestDocumentService(this.testDeltaConnectionServer, tokenProvider, tenantId, documentId));
    }
}
