import { IDocumentService, IDocumentServiceFactory, IPragueResolvedUrl, IResolvedUrl } from "@prague/container-definitions";
import { DocumentService } from "./documentService";
import { TokenProvider } from "./token";

export class OdspDocumentServiceFactory implements IDocumentServiceFactory {
    constructor(private readonly bypassSnapshot = false) {}

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
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`All endpoints urls must be provided. [storageUrl:${storageUrl}][deltaStorageUrl:${deltaStorageUrl}][ordererUrl:${ordererUrl}]`);
        }

        const storageToken = pragueResolvedUrl.tokens.storageToken;
        const socketToken = pragueResolvedUrl.tokens.socketToken;
        if (!storageToken || !socketToken) {
            return Promise.reject(`All tokens must be provided. [storageToken:${storageToken}][socketToken:${socketToken}]`);
        }

        const tokenProvider = new TokenProvider(storageToken, socketToken);
        return Promise.resolve(
            new DocumentService(storageUrl, deltaStorageUrl, ordererUrl, tokenProvider, this.bypassSnapshot));
    }
}
