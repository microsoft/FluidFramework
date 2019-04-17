import * as api from "@prague/client-api";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IPragueResolvedUrl,
    IResolvedUrl } from "@prague/container-definitions";
import { TokenProvider } from "@prague/routerlicious-socket-storage";
import { TestDeltaStorageService } from "./testDeltaStorageService";
import { TestDocumentService } from "./testDocumentService";

class TestDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private deltaUrl: string, private blobUrl: string, private repository: string) {}

    public createDocumentService(url: IResolvedUrl): Promise<IDocumentService> {
        if (url.type !== "prague") {
            // tslint:disable-next-line:max-line-length
            return Promise.reject("Only Prague components currently supported in the RouterliciousDocumentServiceFactory");
        }

        const jwtToken = url.tokens.token;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);
        const deltaStorage = new TestDeltaStorageService();
        return Promise.resolve(new TestDocumentService(deltaStorage, tokenProvider));
    }
}

export function registerAsTest(deltaUrl: string, blobUrl: string, repository: string) {
    const serviceFactory = new TestDocumentServiceFactory(deltaUrl, blobUrl, repository);
    api.registerDocumentServiceFactory(serviceFactory);
}
