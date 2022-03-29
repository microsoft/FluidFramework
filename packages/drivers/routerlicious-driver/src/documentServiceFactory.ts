/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import {
    ensureFluidResolvedUrl,
    getDocAttributesFromProtocolSummary,
    getQuorumValuesFromProtocolSummary,
    RateLimiter,
} from "@fluidframework/driver-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { DocumentService } from "./documentService";
import { IRouterliciousDriverPolicies } from "./policies";
import { ITokenProvider } from "./tokens";
import { RouterliciousOrdererRestWrapper } from "./restWrapper";
import { convertSummaryToCreateNewSummary } from "./createNewUtils";
import { parseFluidUrl, replaceDocumentIdInPath } from "./urlUtils";
import { InMemoryCache } from "./cache";
import { pkgVersion as driverVersion } from "./packageVersion";
import { ISnapshotTreeVersion } from "./definitions";

const defaultRouterliciousDriverPolicies: IRouterliciousDriverPolicies = {
    enablePrefetch: true,
    maxConcurrentStorageRequests: 100,
    maxConcurrentOrdererRequests: 100,
    aggregateBlobsSmallerThanBytes: undefined,
    enableWholeSummaryUpload: false,
    enableRestLess: true,
};

/**
 * Factory for creating the routerlicious document service. Use this if you want to
 * use the routerlicious implementation.
 */
export class RouterliciousDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid:";
    private readonly driverPolicies: IRouterliciousDriverPolicies;
    private readonly blobCache = new InMemoryCache<ArrayBufferLike>();
    private readonly snapshotTreeCache = new InMemoryCache<ISnapshotTreeVersion>();

    constructor(
        private readonly tokenProvider: ITokenProvider,
        driverPolicies: Partial<IRouterliciousDriverPolicies> = {},
    ) {
        this.driverPolicies = {
            ...defaultRouterliciousDriverPolicies,
            ...driverPolicies,
        };
    }

    public async createContainer(
        createNewSummary: ISummaryTree | undefined,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);
        assert(!!createNewSummary, 0x204 /* "create empty file not supported" */);
        assert(!!resolvedUrl.endpoints.ordererUrl, 0x0b2 /* "Missing orderer URL!" */);
        const parsedUrl = parseFluidUrl(resolvedUrl.url);
        if (!parsedUrl.pathname) {
            throw new Error("Parsed url should contain tenant and doc Id!!");
        }
        const [, tenantId] = parsedUrl.pathname.split("/");

        const protocolSummary = createNewSummary.tree[".protocol"] as ISummaryTree;
        const appSummary = createNewSummary.tree[".app"] as ISummaryTree;
        if (!(protocolSummary && appSummary)) {
            throw new Error("Protocol and App Summary required in the full summary");
        }
        const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
        const quorumValues = getQuorumValuesFromProtocolSummary(protocolSummary);

        const logger2 = ChildLogger.create(logger, "RouterliciousDriver");
        const rateLimiter = new RateLimiter(this.driverPolicies.maxConcurrentOrdererRequests);
        const ordererRestWrapper = await RouterliciousOrdererRestWrapper.load(
            tenantId,
            undefined,
            this.tokenProvider,
            logger2,
            rateLimiter,
            this.driverPolicies.enableRestLess,
            resolvedUrl.endpoints.ordererUrl,
        );
        // the backend responds with the actual document ID associated with the new container.
        const documentId = await ordererRestWrapper.post<string>(
            `/documents/${tenantId}`,
            {
                summary: convertSummaryToCreateNewSummary(appSummary),
                sequenceNumber: documentAttributes.sequenceNumber,
                values: quorumValues,
            },
        );
        parsedUrl.set("pathname", replaceDocumentIdInPath(parsedUrl.pathname, documentId));
        const deltaStorageUrl = resolvedUrl.endpoints.deltaStorageUrl;
        if (!deltaStorageUrl) {
            throw new Error(
                `All endpoints urls must be provided. [deltaStorageUrl:${deltaStorageUrl}]`);
        }
        const parsedDeltaStorageUrl = new URL(deltaStorageUrl);
        parsedDeltaStorageUrl.pathname = replaceDocumentIdInPath(parsedDeltaStorageUrl.pathname, documentId);

        return this.createDocumentService(
            {
                ...resolvedUrl,
                url: parsedUrl.toString(),
                id: documentId,
                endpoints: {
                    ...resolvedUrl.endpoints,
                    deltaStorageUrl: parsedDeltaStorageUrl.toString(),
                },
            },
            logger,
            clientIsSummarizer,
        );
    }

    /**
     * Creates the document service after extracting different endpoints URLs from a resolved URL.
     *
     * @param resolvedUrl - URL containing different endpoint URLs.
     * @returns Routerlicious document service.
     */
    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);

        const fluidResolvedUrl = resolvedUrl;
        const storageUrl = fluidResolvedUrl.endpoints.storageUrl;
        const ordererUrl = fluidResolvedUrl.endpoints.ordererUrl;
        const deltaStorageUrl = fluidResolvedUrl.endpoints.deltaStorageUrl;
        if (!ordererUrl || !deltaStorageUrl) {
            throw new Error(
                `All endpoints urls must be provided. [ordererUrl:${ordererUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        const parsedUrl = parseFluidUrl(fluidResolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.pathname.split("/");
        if (!documentId || !tenantId) {
            throw new Error(
                `Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const logger2 = ChildLogger.create(logger, "RouterliciousDriver", { all: { driverVersion }});

        return new DocumentService(
            fluidResolvedUrl,
            ordererUrl,
            deltaStorageUrl,
            storageUrl,
            logger2,
            this.tokenProvider,
            tenantId,
            documentId,
            this.driverPolicies,
            this.blobCache,
            this.snapshotTreeCache);
    }
}
