/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { DefaultTokenProvider } from "@fluidframework/routerlicious-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ensureFluidResolvedUrl,
    getDocAttributesFromProtocolSummary,
    getQuorumValuesFromProtocolSummary,
} from "@fluidframework/driver-utils";
import { ISummaryTree, NackErrorType } from "@fluidframework/protocol-definitions";
import { LocalDocumentDeltaConnection } from "./localDocumentDeltaConnection";
import { createLocalDocumentService } from "./localDocumentService";

/**
 * Implementation of document service factory for local use.
 */
export class LocalDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-test:";

    // A map of clientId to LocalDocumentService.
    private readonly documentDeltaConnectionsMap: Map<string, LocalDocumentDeltaConnection> = new Map();

    /**
     * @param localDeltaConnectionServer - delta connection server for ops
     */
    constructor(
        private readonly localDeltaConnectionServer: ILocalDeltaConnectionServer,
        private readonly innerDocumentService?: IDocumentService) { }

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
        const documentStorage = (this.localDeltaConnectionServer as LocalDeltaConnectionServer).documentStorage;

        const protocolSummary = createNewSummary.tree[".protocol"] as ISummaryTree;
        const appSummary = createNewSummary.tree[".app"] as ISummaryTree;
        if (!(protocolSummary && appSummary)) {
            throw new Error("Protocol and App Summary required in the full summary");
        }
        const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
        const quorumValues = getQuorumValuesFromProtocolSummary(protocolSummary);
        const sequenceNumber = documentAttributes.sequenceNumber;
        await documentStorage.createDocument(
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

        const tokenProvider = new DefaultTokenProvider(jwtToken);

        return createLocalDocumentService(
            resolvedUrl,
            this.localDeltaConnectionServer,
            tokenProvider,
            tenantId,
            documentId,
            this.documentDeltaConnectionsMap,
            this.innerDocumentService);
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
