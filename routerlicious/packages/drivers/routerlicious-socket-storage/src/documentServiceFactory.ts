import {
    IDocumentService,
    IDocumentServiceFactory,
    IErrorTrackingService,
    IPragueResolvedUrl,
    IResolvedUrl,
} from "@prague/container-definitions";
import { ICredentials, IGitCache } from "@prague/services-client";
import { DocumentService } from "./documentService";
import { DocumentService2 } from "./documentService2";
import {DefaultErrorTracking } from "./errorTracking";

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
        if (!storageUrl || !ordererUrl || !deltaStorageUrl) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`All endpoints urls must be provided. [storageUrl:${storageUrl}][ordererUrl:${ordererUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        if (this.useDocumentService2) {
            return Promise.resolve(new DocumentService2(
                ordererUrl,
                deltaStorageUrl,
                storageUrl,
                this.errorTracking,
                this.disableCache,
                this.historianApi,
                this.credentials,
            ));
        }

        return Promise.resolve(new DocumentService(
            ordererUrl,
            deltaStorageUrl,
            storageUrl,
            this.errorTracking,
            this.disableCache,
            this.historianApi,
            this.credentials,
            this.gitCache));
    }
}
