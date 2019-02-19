import {
    IDocumentService,
    ITokenProvider,
} from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import * as Translator from "@prague/translator";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";

export class TranslationWork extends BaseWork implements IWork {

    constructor(
        docId: string,
        tenantId: string,
        tokenProvider: ITokenProvider,
        config: any,
        private service: IDocumentService) {
        super(docId, tenantId, tokenProvider, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { encrypted: undefined, localMinSeq: 0, client: { type: "translation"} },
            this.service,
            task);

        // Wait for the document to get fully connected.
        if (!this.document.isConnected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }

        const rootMap = this.document.getRoot();
        const sharedString = rootMap.get("text") as Sequence.SharedString;
        const insightsMap = rootMap.get("insights") as ISharedMap;

        if (sharedString && insightsMap) {
            await insightsMap.wait(sharedString.id);
            Translator.run(sharedString, insightsMap);
        }

    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
