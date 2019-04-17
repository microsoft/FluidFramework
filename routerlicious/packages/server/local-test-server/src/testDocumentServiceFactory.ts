import {
    IDocumentService,
    IDocumentServiceFactory,
    IPragueResolvedUrl,
    IResolvedUrl,
} from "@prague/container-definitions";
import { TokenProvider } from "@prague/routerlicious-socket-storage";
import { createTestDocumentService } from "./registration";
import { ITestDeltaConnectionServer } from "./testDeltaConnectionServer";

export class TestDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private testDeltaConnectionServer: ITestDeltaConnectionServer) {}

    public createDocumentService(url: IResolvedUrl): Promise<IDocumentService> {
        if (url.type !== "prague") {
            // tslint:disable-next-line:max-line-length
            return Promise.reject("Only Prague components currently supported in the RouterliciousDocumentServiceFactory");
        }

        const pragueResolvedUrl = url as IPragueResolvedUrl;
        const jwtToken = pragueResolvedUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new TokenProvider(jwtToken);

        return Promise.resolve(createTestDocumentService(this.testDeltaConnectionServer, tokenProvider));
    }
}
