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
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { TokenProvider } from "@microsoft/fluid-routerlicious-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    ensureFluidResolvedUrl,
    getDocAttributesFromProtocolSummary,
    getQuorumValuesFromProtocolSummary,
} from "@microsoft/fluid-driver-utils";
import { ISummaryTree } from "@microsoft/fluid-protocol-definitions";
import { IExperimentalDocumentStorage } from "@microsoft/fluid-server-services-core";
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

    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger: ITelemetryLogger,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);
        const pathName = new URL(resolvedUrl.url).pathname;
        const pathArr = pathName.split("/");
        const tenantId = pathArr[pathArr.length - 2];
        const id = pathArr[pathArr.length - 1];
        if (!this.localDeltaConnectionServer) {
            throw new Error("Provide the localDeltaConnectionServer!!");
        }
        // eslint-disable-next-line max-len
        const expDocumentStorage = ((this.localDeltaConnectionServer as LocalDeltaConnectionServer).documentStorage as IExperimentalDocumentStorage);
        if (!(expDocumentStorage && expDocumentStorage.isExperimentalDocumentStorage)) {
            throw new Error("Storage has no experimental features!!");
        }

        const protocolSummary = createNewSummary.tree[".protocol"] as ISummaryTree;
        const appSummary = createNewSummary.tree[".app"] as ISummaryTree;
        if (!(protocolSummary && appSummary)) {
            throw new Error("Protocol and App Summary required in the full summary");
        }
        const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
        const quorumValues = getQuorumValuesFromProtocolSummary(protocolSummary);
        const sequenceNumber = documentAttributes.sequenceNumber;
        await expDocumentStorage.createDocument(
            tenantId,
            id,
            appSummary,
            sequenceNumber,
            quorumValues,
        );
        return this.createDocumentService(resolvedUrl);
    }

    /**
     * Creates and returns a document service for testing using the given resolved
     * URL for the tenant ID, document ID, and token.
     * @param resolvedUrl - resolved URL of document
     */
    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);

        const parsedUrl = parse(resolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.path ? parsedUrl.path.split("/") : [];
        if (!documentId || !tenantId) {
            throw new Error(`Couldn't parse resolved url. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const fluidResolvedUrl = resolvedUrl;
        const jwtToken = fluidResolvedUrl.tokens.jwt;
        if (!jwtToken) {
            throw new Error(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);

        return createTestDocumentService(
            resolvedUrl,
            this.localDeltaConnectionServer,
            tokenProvider,
            tenantId,
            documentId);
    }
}
