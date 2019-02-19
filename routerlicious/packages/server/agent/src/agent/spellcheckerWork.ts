import {
    IDocumentService,
    ITokenProvider,
} from "@prague/container-definitions";
import * as MergeTree from "@prague/merge-tree";
import * as Sequence from "@prague/sequence";
import * as Spellcheker from "@prague/spellchecker";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";

export class SpellcheckerWork extends BaseWork implements IWork {

    constructor(
        docId: string,
        tenantId: string,
        tokenProvider: ITokenProvider,
        config: any,
        private dictionary: MergeTree.TST<number>,
        private service: IDocumentService) {

        super(docId, tenantId, tokenProvider, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            {
                blockUpdateMarkers: true,
                client: { type: "spell"},
                encrypted: undefined,
                localMinSeq: 0,
            },
            this.service,
            task);

        // Wait for the document to get fully connected.
        if (!this.document.isConnected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }

        const rootMap = this.document.getRoot();
        const sharedString = rootMap.get("text") as Sequence.SharedString;

        if (sharedString) {
            Spellcheker.run(sharedString, this.dictionary);
        }
    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
