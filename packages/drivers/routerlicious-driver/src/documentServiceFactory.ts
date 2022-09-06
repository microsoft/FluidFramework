/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
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
import { ISession } from "@fluidframework/server-services-client";
import { DocumentService } from "./documentService";
import { IRouterliciousDriverPolicies } from "./policies";
import { ITokenProvider } from "./tokens";
import { RouterliciousOrdererRestWrapper } from "./restWrapper";
import { convertSummaryToCreateNewSummary } from "./createNewUtils";
import { parseFluidUrl, replaceDocumentIdInPath, getDiscoveredFluidResolvedUrl } from "./urlUtils";
import { ICache, InMemoryCache, NullCache } from "./cache";
import { pkgVersion as driverVersion } from "./packageVersion";
import { ISnapshotTreeVersion } from "./definitions";

const defaultRouterliciousDriverPolicies: IRouterliciousDriverPolicies = {
    enablePrefetch: true,
    maxConcurrentStorageRequests: 100,
    maxConcurrentOrdererRequests: 100,
    aggregateBlobsSmallerThanBytes: undefined,
    enableDiscovery: false,
    enableWholeSummaryUpload: false,
    enableRestLess: true,
    enableInternalSummaryCaching: true,
};

/**
 * Factory for creating the routerlicious document service. Use this if you want to
 * use the routerlicious implementation.
 */
export class RouterliciousDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid:";
    private readonly driverPolicies: IRouterliciousDriverPolicies;
    private readonly blobCache: ICache<ArrayBufferLike>;
    private readonly snapshotTreeCache: ICache<ISnapshotTreeVersion>;

    constructor(
        private readonly tokenProvider: ITokenProvider,
        driverPolicies: Partial<IRouterliciousDriverPolicies> = {},
    ) {
        this.driverPolicies = {
            ...defaultRouterliciousDriverPolicies,
            ...driverPolicies,
        };
        this.blobCache = new InMemoryCache<ArrayBufferLike>();
        if (this.driverPolicies.enableInternalSummaryCaching) {
            this.snapshotTreeCache = new InMemoryCache<ISnapshotTreeVersion>();
        } else {
            this.snapshotTreeCache = new NullCache<ISnapshotTreeVersion>();
        }
    }

    /**
     * {@inheritDoc @fluidframework/driver-definitions#IDocumentServiceFactory.createContainer}
     *
     * @throws {@link DocumentPostCreateError}
     * If an exception is thrown while invoking the provided {@link ITokenProvider.documentPostCreateCallback}.
     */
    public async createContainer(
        createNewSummary: ISummaryTree | undefined,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);
        if (createNewSummary === undefined) {
            throw new Error("Empty file summary creation isn't supported in this driver.");
        }
        assert(!!resolvedUrl.endpoints.ordererUrl, 0x0b2 /* "Missing orderer URL!" */);
        let parsedUrl = parseFluidUrl(resolvedUrl.url);
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

        // @TODO: Remove returned "string" type when removing back-compat code
        const res = await ordererRestWrapper.post<{ id: string; token?: string; session?: ISession; } | string>(
            `/documents/${tenantId}`,
            {
                summary: convertSummaryToCreateNewSummary(appSummary),
                sequenceNumber: documentAttributes.sequenceNumber,
                values: quorumValues,
                enableDiscovery: this.driverPolicies.enableDiscovery,
                generateToken: this.tokenProvider.documentPostCreateCallback !== undefined,
            },
        );

        // For supporting backward compatibility, when the request has generateToken === true, it will return
        // an object instead of string
        // @TODO: Remove the logic when no need to support back-compat

        let documentId: string;
        let token: string | undefined;
        let session: ISession | undefined;
        if (typeof res === "string") {
            documentId = res;
        } else {
            documentId = res.id;
            token = res.token;
            session = this.driverPolicies.enableDiscovery ? res.session : undefined;
        }
        parsedUrl = parseFluidUrl(resolvedUrl.url);

        // @TODO: Remove token from the condition, checking the documentPostCreateCallback !== undefined
        // is sufficient to determine if the token will be undefined or not.
        if (token && this.tokenProvider.documentPostCreateCallback !== undefined) {
            try {
                await this.tokenProvider.documentPostCreateCallback(documentId, token);
            } catch (error: any) {
                throw new DocumentPostCreateError(error);
            }
        }

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
            session,
        );
    }

    /**
     * {@inheritDoc @fluidframework/driver-definitions#IDocumentServiceFactory.createDocumentService}
     *
     * @returns Routerlicious document service.
     */
    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
        session?: ISession,
    ): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);

        const parsedUrl = parseFluidUrl(resolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.pathname.split("/");
        if (!documentId || !tenantId) {
            throw new Error(
                `Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }
        const logger2 = ChildLogger.create(logger, "RouterliciousDriver", { all: { driverVersion } });

        const discoverFluidResolvedUrl = async (): Promise<IFluidResolvedUrl> => {
            if (!this.driverPolicies.enableDiscovery) {
                return resolvedUrl;
            }
            const rateLimiter = new RateLimiter(this.driverPolicies.maxConcurrentOrdererRequests);
            const ordererRestWrapper = await RouterliciousOrdererRestWrapper.load(
                tenantId,
                documentId,
                this.tokenProvider,
                logger2,
                rateLimiter,
                this.driverPolicies.enableRestLess,
                resolvedUrl.endpoints.ordererUrl,
            );
            // The service responds with the current document session associated with the container.
            const discoveredSession = await ordererRestWrapper.get<ISession>(
                `/documents/${tenantId}/session/${documentId}`,
            );
            return getDiscoveredFluidResolvedUrl(resolvedUrl, discoveredSession);
        };
        const fluidResolvedUrl: IFluidResolvedUrl = session !== undefined
            ? getDiscoveredFluidResolvedUrl(resolvedUrl, session)
            : await discoverFluidResolvedUrl();

        const storageUrl = fluidResolvedUrl.endpoints.storageUrl;
        const ordererUrl = fluidResolvedUrl.endpoints.ordererUrl;
        const deltaStorageUrl = fluidResolvedUrl.endpoints.deltaStorageUrl;
        const deltaStreamUrl = fluidResolvedUrl.endpoints.deltaStreamUrl || ordererUrl; // backward compatibility
        if (!ordererUrl || !deltaStorageUrl) {
            throw new Error(
                `All endpoints urls must be provided. [ordererUrl:${ordererUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        return new DocumentService(
            fluidResolvedUrl,
            ordererUrl,
            deltaStorageUrl,
            deltaStreamUrl,
            storageUrl,
            logger2,
            this.tokenProvider,
            tenantId,
            documentId,
            this.driverPolicies,
            this.blobCache,
            this.snapshotTreeCache,
            discoverFluidResolvedUrl);
    }
}

/**
 * Error returned by {@link RouterliciousDocumentServiceFactory.createContainer} when an error is thrown
 * in {@link ITokenProvider.documentPostCreateCallback}.
 * It is the consumer's responsibility to ensure that any state related to container creation is appropriately
 * cleaned up in the event of failure.
 * This includes the document itself, which will have been created by the time this error was thrown.
 *
 * @remarks TODO: examples of suggested actions for recovery.
 * - How would a user delete the created document?
 * - What would a retry pattern look like here?
 */
export class DocumentPostCreateError extends Error {
    public constructor(
        /**
         * Inner error being wrapped.
         */
        private readonly innerError: Error,
    ) {
        super(innerError.message);
    }

    public readonly name = "DocumentPostCreateError";

    public get stack() { return this.innerError.stack; }
}
