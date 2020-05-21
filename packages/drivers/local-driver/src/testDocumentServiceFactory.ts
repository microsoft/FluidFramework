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
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { TokenProvider } from "@microsoft/fluid-routerlicious-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    ensureFluidResolvedUrl,
    getDocAttributesFromProtocolSummary,
    getQuorumValuesFromProtocolSummary,
} from "@microsoft/fluid-driver-utils";
import { ISummaryTree, NackErrorType } from "@microsoft/fluid-protocol-definitions";
import { IExperimentalDocumentStorage } from "@microsoft/fluid-server-services-core";
import { TestDocumentDeltaConnection } from "./testDocumentDeltaConnection";
import { createTestDocumentService } from "./testDocumentService";

/**
 * Implementation of document service factory for testing.
 */
export class TestDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly isExperimentalDocumentServiceFactory = true;
    public readonly protocolName = "fluid-test:";

    // A map of clientId to TestDocumentService.
    private readonly documentDeltaConnectionsMap: Map<string, TestDocumentDeltaConnection> = new Map();

    /**
     * @param localDeltaConnectionServer - delta connection server for ops
     */
    constructor(private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer) { }

    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
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
            documentAttributes.term ?? 1,
            quorumValues,
        );
        return this.createDocumentService(resolvedUrl, logger);
    }

    /**
     * Creates and returns a document service for testing using the given resolved
     * URL for the tenant ID, document ID, and token.
     * @param resolvedUrl - resolved URL of document
     */
    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
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
            documentId,
            this.documentDeltaConnectionsMap);
    }

    /**
     * Gets the document delta connection for the clientId and asks it to disconnect the client.
     * @param clientId - The ID of the client to be disconnected.
     * @param disconnectReason - The reason of the disconnection.
     */
    public disconnectClient(clientId: string, disconnectReason: string) {
        if (!this.documentDeltaConnectionsMap.has(clientId)) {
            throw new Error(`No client with the id: ${clientId}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.documentDeltaConnectionsMap.get(clientId)!.disconnectClient(disconnectReason);
    }

    /**
     * Gets the document delta connection for the clientId and asks it to nack the client.
     * @param clientId - The ID of the client to be Nack'd.
     * @param code - An error code number that represents the error. It will be a valid HTTP error code.
     * @param type - Type of the Nack.
     * @param message - A message about the nack for debugging/logging/telemetry purposes.
     */
    public nackClient(clientId: string, code?: number, type?: NackErrorType, message?: any) {
        if (!this.documentDeltaConnectionsMap.has(clientId)) {
            throw new Error(`No client with the id: ${clientId}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.documentDeltaConnectionsMap.get(clientId)!.nackClient(code, type, message);
    }
}
