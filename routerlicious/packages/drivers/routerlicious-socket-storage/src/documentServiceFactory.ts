import {
    IDocumentService,
    IDocumentServiceFactory,
    IErrorTrackingService,
    IPragueResolvedUrl,
    IResolvedUrl,
} from "@prague/container-definitions";
import { ICredentials, IGitCache } from "@prague/services-client";
import { parse } from "url";
import { DocumentService } from "./documentService";
import { DocumentService2 } from "./documentService2";
import { DefaultErrorTracking } from "./errorTracking";
import { TokenProvider } from "./tokens";

export class RouterliciousDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(
        private useDocumentService2: boolean = false,
        private errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
        private disableCache: boolean = false,
        private historianApi: boolean = true,
        private gitCache: IGitCache | null = null,
        private credentials?: ICredentials) {}

    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type !== "prague") {
            // tslint:disable-next-line:max-line-length
            return Promise.reject("Only Prague components currently supported in the RouterliciousDocumentServiceFactory");
        }

        const pragueResolvedUrl = resolvedUrl as IPragueResolvedUrl;
        const storageUrl = pragueResolvedUrl.endpoints.storageUrl;
        const ordererUrl = pragueResolvedUrl.endpoints.ordererUrl;
        const deltaStorageUrl = pragueResolvedUrl.endpoints.deltaStorageUrl;
        if (!ordererUrl || !deltaStorageUrl) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`All endpoints urls must be provided. [ordererUrl:${ordererUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        const parsedUrl = parse(pragueResolvedUrl.url);
        const [, tenantId, documentId] = parsedUrl.pathname!.split("/");
        if (!documentId || !tenantId) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const jwtToken = pragueResolvedUrl.tokens.jwt;
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
        }

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
