import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import { createReplayDocumentService } from "./registration";

export class ReplayDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(
        private from: number,
        private to: number,
        private documentServiceFactory: IDocumentServiceFactory) {}

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        return Promise.resolve(createReplayDocumentService(
            this.from,
            this.to,
            await this.documentServiceFactory.createDocumentService(resolvedUrl)));
    }
}
