import {
    IDocumentServiceFactory,
    IHost,
} from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { Translator } from "@prague/translator";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";

export class TranslationWork extends BaseWork implements IWork {

    constructor(
        alfred: string,
        docId: string,
        tenantId: string,
        host: IHost,
        config: any,
        private serviceFactory: IDocumentServiceFactory) {
        super(alfred, docId, tenantId, host, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { encrypted: undefined, localMinSeq: 0, client: { type: "translation"} },
            this.serviceFactory,
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
            const translator = new Translator();
            translator.run(
                sharedString,
                insightsMap,
                this.config.intelligence.translation.key);
        }

    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
