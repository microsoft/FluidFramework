/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { TokenProvider } from "@microsoft/fluid-routerlicious-driver";
import { ILocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { createTestDocumentService } from "./testDocumentService";

/**
 * Implementation of document service factory for testing.
 */
export class TestDocumentServiceFactory implements IDocumentServiceFactory {

    public readonly protocolName = "fluid-test:";
    /**
     * @param localDeltaConnectionServer - delta connection server for ops
     */
    constructor(private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer) { }

    /**
     * Creates and returns a document service for testing using the given resolved
     * URL for the tenant ID, document ID, and token.
     * @param resolvedUrl - resolved URL of document
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type !== "fluid") {
            // eslint-disable-next-line max-len
            return Promise.reject("Only Fluid components currently supported in the RouterliciousDocumentServiceFactory");
        }

        const parsedUrl = parse(resolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.path.split("/");
        if (!documentId || !tenantId) {
            // eslint-disable-next-line max-len
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const fluidResolvedUrl = resolvedUrl;
        const jwtToken = fluidResolvedUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);

        return Promise.resolve(
            createTestDocumentService(this.localDeltaConnectionServer, tokenProvider, tenantId, documentId));
    }
}
