import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import { createReplayDocumentService } from "./registration";

export class ReplayDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(private deltaUrl: string, private from: number, private to: number) {}

    public createDocumentService(url: IResolvedUrl): Promise<IDocumentService> {
        return Promise.resolve(createReplayDocumentService(this.deltaUrl, this.from, this.to));
    }
}
