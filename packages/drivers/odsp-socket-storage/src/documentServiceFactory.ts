import { IDocumentService, IDocumentServiceFactory, IPragueResolvedUrl, IResolvedUrl } from "@prague/container-definitions";
import { parse } from "url";
import { DocumentService } from "./documentService";
import { TokenProvider } from "./token";

/**
 * Factory for creating the legacy odsp document service. Use this if you want to
 * use the legacy odsp implementation.
 */
export class OdspDocumentServiceFactory implements IDocumentServiceFactory {
    constructor(private readonly bypassSnapshot = false) { }

    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        if (resolvedUrl.type !== "prague") {
            return Promise.reject("Only Prague components currently supported in the OdspDocumentServiceFactory");
        }

        const pragueResolvedUrl = resolvedUrl as IPragueResolvedUrl;
        const storageUrl = pragueResolvedUrl.endpoints.storageUrl;
        const deltaStorageUrl = pragueResolvedUrl.endpoints.deltaStorageUrl;
        const ordererUrl = pragueResolvedUrl.endpoints.ordererUrl;

        const invalidSnapshotUrl = !storageUrl && !this.bypassSnapshot;
        if (invalidSnapshotUrl || !deltaStorageUrl || !ordererUrl) {
            return Promise.reject(`All endpoints urls must be provided.`
                + `[storageUrl:${storageUrl}][deltaStorageUrl:${deltaStorageUrl}][ordererUrl:${ordererUrl}]`);
        }

        const storageToken = pragueResolvedUrl.tokens.storageToken;
        const socketToken = pragueResolvedUrl.tokens.socketToken;
        if (!storageToken || !socketToken) {
            return Promise.reject(`All tokens must be provided. [storageToken:${storageToken}][socketToken:${socketToken}]`);
        }

        const parsedUrl = parse(pragueResolvedUrl.url);
        if (!parsedUrl.pathname) {
            return Promise.reject(`Couldn't parse resolved url. [url:${pragueResolvedUrl.url}]`);
        }

        const [, tenantId, documentId] = parsedUrl.pathname.split("/");
        if (!documentId || !tenantId) {
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [url:${pragueResolvedUrl.url}]`);
        }

        const tokenProvider = new TokenProvider(storageToken, socketToken);
        return Promise.resolve(
            new DocumentService(
                storageUrl,
                deltaStorageUrl,
                ordererUrl,
                tokenProvider,
                tenantId,
                documentId,
                this.bypassSnapshot));
    }
}
