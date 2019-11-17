/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService,
         IDocumentServiceFactory,
         IFluidResolvedUrl,
         IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IErrorTrackingService } from "@microsoft/fluid-protocol-definitions";
import { ICredentials, IGitCache } from "@microsoft/fluid-server-services-client";
import { parse } from "url";
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

    /**
     * Creates the document service after extracting different endpoints URLs from a resolved URL.
     *
     * @param resolvedUrl - URL containing different endpoint URLs.
     * @returns Routerlicious document service.
     */
    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type !== "fluid") {
            // tslint:disable-next-line:max-line-length
            return Promise.reject("Only Fluid components currently supported in the RouterliciousDocumentServiceFactory");
        }

        const fluidResolvedUrl = resolvedUrl as IFluidResolvedUrl;
        const storageUrl = fluidResolvedUrl.endpoints.storageUrl;
        const ordererUrl = fluidResolvedUrl.endpoints.ordererUrl;
        const deltaStorageUrl = fluidResolvedUrl.endpoints.deltaStorageUrl;
        if (!ordererUrl || !deltaStorageUrl) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`All endpoints urls must be provided. [ordererUrl:${ordererUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        const parsedUrl = parse(fluidResolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.pathname!.split("/");
        if (!documentId || !tenantId) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const jwtToken = fluidResolvedUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);

        if (this.useDocumentService2) {
            return Promise.resolve(new DocumentService2(
                ordererUrl,
                deltaStorageUrl,
                storageUrl,
                this.errorTracking,
                this.disableCache,
                this.historianApi,
                this.credentials,
                tokenProvider,
                tenantId,
                documentId));
        } else {
            return Promise.resolve(new DocumentService(
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
                documentId));
        }
    }
}
