/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { parse } from "url";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { IErrorTrackingService, ISummaryTree } from "@microsoft/fluid-protocol-definitions";
import { ICredentials, IGitCache } from "@microsoft/fluid-server-services-client";
import {
    ensureFluidResolvedUrl,
    getDocAttributesFromProtocolSummary,
    getQuorumValuesFromProtocolSummary,
} from "@microsoft/fluid-driver-utils";
import Axios from "axios";
import { DocumentService } from "./documentService";
import { DocumentService2 } from "./documentService2";
import { DefaultErrorTracking } from "./errorTracking";
import { TokenProvider } from "./tokens";

/**
 * Factory for creating the routerlicious document service. Use this if you want to
 * use the routerlicious implementation.
 */
export class RouterliciousDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid:";
    constructor(
        private readonly useDocumentService2: boolean = false,
        private readonly errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
        private readonly disableCache: boolean = false,
        private readonly historianApi: boolean = true,
        private readonly gitCache: IGitCache | null = null,
        private readonly credentials?: ICredentials,
    ) {
    }

    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger: ITelemetryLogger,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);
        assert(resolvedUrl.endpoints.ordererUrl);
        const parsedUrl = parse(resolvedUrl.url);
        if (!parsedUrl.pathname) {
            throw new Error("Parsed url should contain tenant and doc Id!!");
        }
        const [, tenantId, id] = parsedUrl.pathname.split("/");
        const protocolSummary = createNewSummary.tree[".protocol"] as ISummaryTree;
        const appSummary = createNewSummary.tree[".app"] as ISummaryTree;
        if (!(protocolSummary && appSummary)) {
            throw new Error("Protocol and App Summary required in the full summary");
        }
        const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
        const quorumValues = getQuorumValuesFromProtocolSummary(protocolSummary);
        await Axios.post(
            `${resolvedUrl.endpoints.ordererUrl}/documents/${tenantId}`,
            {
                id,
                summary: appSummary,
                sequenceNumber: documentAttributes.sequenceNumber,
                values: quorumValues,
            });
        return this.createDocumentService(resolvedUrl);
    }

    /**
     * Creates the document service after extracting different endpoints URLs from a resolved URL.
     *
     * @param resolvedUrl - URL containing different endpoint URLs.
     * @returns Routerlicious document service.
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);

        const fluidResolvedUrl = resolvedUrl;
        const storageUrl = fluidResolvedUrl.endpoints.storageUrl;
        const ordererUrl = fluidResolvedUrl.endpoints.ordererUrl;
        const deltaStorageUrl = fluidResolvedUrl.endpoints.deltaStorageUrl;
        if (!ordererUrl || !deltaStorageUrl) {
            throw new Error(
                `All endpoints urls must be provided. [ordererUrl:${ordererUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        const parsedUrl = parse(fluidResolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.pathname!.split("/");
        if (!documentId || !tenantId) {
            throw new Error(
                `Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const jwtToken = fluidResolvedUrl.tokens.jwt;
        if (!jwtToken) {
            throw new Error(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);

        if (this.useDocumentService2) {
            return new DocumentService2(
                fluidResolvedUrl,
                ordererUrl,
                deltaStorageUrl,
                storageUrl,
                this.errorTracking,
                this.disableCache,
                this.historianApi,
                this.credentials,
                tokenProvider,
                tenantId,
                documentId);
        } else {
            return new DocumentService(
                fluidResolvedUrl,
                ordererUrl,
                deltaStorageUrl,
                storageUrl,
                this.errorTracking,
                this.disableCache,
                this.historianApi,
                this.credentials,
                this.gitCache,
                tokenProvider,
                tenantId,
                documentId);
        }
    }
}
