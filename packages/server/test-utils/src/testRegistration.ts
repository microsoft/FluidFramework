/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/client-api";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl } from "@prague/container-definitions";
import { TokenProvider } from "@prague/routerlicious-socket-storage";
import { parse } from "url";
import { TestDeltaStorageService } from "./testDeltaStorageService";
import { TestDocumentService } from "./testDocumentService";

class TestDocumentServiceFactory implements IDocumentServiceFactory {
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

        const jwtToken = resolvedUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);
        const deltaStorage = new TestDeltaStorageService();
        return Promise.resolve(new TestDocumentService(deltaStorage, tokenProvider, tenantId, documentId));
    }
}

export function registerAsTest(deltaUrl: string, blobUrl: string, repository: string) {
    const serviceFactory = new TestDocumentServiceFactory();
    api.registerDocumentServiceFactory(serviceFactory);
}
