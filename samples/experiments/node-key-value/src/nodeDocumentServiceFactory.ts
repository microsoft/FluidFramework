import {
    IDocumentService,
    IDocumentServiceFactory,
    IPragueResolvedUrl,
    IResolvedUrl,
} from "@prague/container-definitions";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import * as url from "url";

export class NodeDocumentServiceFactory implements IDocumentServiceFactory {
    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {

        if (resolvedUrl.type !== "prague") {
            Promise.reject("only prague type urls can be resolved.");
        }

        const urlAsPragueUrl = resolvedUrl as IPragueResolvedUrl;

        const ordererUrl = urlAsPragueUrl.endpoints.ordererUrl;
        const storageUrl = urlAsPragueUrl.endpoints.storageUrl;
        const deltaStorageUrl = urlAsPragueUrl.endpoints.deltaStorageUrl;

        if (!ordererUrl || !storageUrl || !deltaStorageUrl) {
            // tslint:disable-next-line:max-line-length
            Promise.reject(`endpoint urls must exist: [ordererUrl:${ordererUrl}][storageUrl:${storageUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        const parsedUrl = url.parse(urlAsPragueUrl.url);
        const [, tenantId, documentId] = parsedUrl.path.split("/");
        if (!documentId || !tenantId) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const jwtToken = urlAsPragueUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new socketStorage.TokenProvider(jwtToken);

        return Promise.resolve(
            socketStorage.createDocumentService(
                ordererUrl,
                deltaStorageUrl,
                storageUrl,
                tokenProvider,
                tenantId,
                documentId));
    }
}
